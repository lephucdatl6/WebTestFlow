import { promises as fs } from 'node:fs';
import path from 'node:path';

const MANAGED_FILE_PATTERN = /^(failed-step|spec)-.*\.png$/i;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB

// Serialize cleanup runs so overlapping test runs / cleanups don't race on unlink/readdir.
let cleanupQueue: Promise<void> = Promise.resolve();

interface ManagedFile {
	name: string;
	filePath: string;
	mtimeMs: number;
	size: number;
}

async function listManagedFiles(dir: string): Promise<ManagedFile[]> {
	let entries;
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		// Missing or unreadable directory — nothing to clean.
		return [];
	}

	const files: ManagedFile[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !MANAGED_FILE_PATTERN.test(entry.name)) {
			continue;
		}
		const filePath = path.join(dir, entry.name);
		try {
			const stat = await fs.stat(filePath);
			if (stat.isFile()) {
				files.push({ name: entry.name, filePath, mtimeMs: stat.mtimeMs, size: stat.size });
			}
		} catch {
			// File vanished or is inaccessible between readdir and stat — skip it.
		}
	}
	return files;
}

async function deleteFile(filePath: string): Promise<void> {
	try {
		await fs.unlink(filePath);
	} catch {
		// Already deleted or inaccessible — ignore.
	}
}

async function runCleanup(dir: string): Promise<void> {
	const files = await listManagedFiles(dir);
	if (files.length === 0) return;

	const now = Date.now();

	// 1) Delete expired screenshots (older than the max age).
	const remaining: ManagedFile[] = [];
	for (const file of files) {
		if (now - file.mtimeMs > MAX_AGE_MS) {
			await deleteFile(file.filePath);
		} else {
			remaining.push(file);
		}
	}

	// 2) Enforce the size cap by deleting the oldest first.
	let totalBytes = remaining.reduce((sum, file) => sum + file.size, 0);
	if (totalBytes > MAX_TOTAL_BYTES) {
		const oldestFirst = [...remaining].sort((a, b) => a.mtimeMs - b.mtimeMs);
		for (const file of oldestFirst) {
			if (totalBytes <= MAX_TOTAL_BYTES) break;
			await deleteFile(file.filePath);
			totalBytes -= file.size;
		}
	}
}

/**
 * Clean up WebTestFlow-managed failure screenshots in the given directory.
 * Only files matching the WebTestFlow naming convention are touched.
 * Serializes overlapping calls and never throws — cleanup is best-effort.
 */
export function cleanupScreenshots(dir: string | undefined): Promise<void> {
	if (!dir) return Promise.resolve();
	cleanupQueue = cleanupQueue.then(() => runCleanup(dir)).catch(() => undefined);
	return cleanupQueue;
}

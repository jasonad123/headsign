#!/usr/bin/env node
// Bumps the version in package.json and svelte-app/package.json together,
// optionally committing and tagging the change.
//
// Usage:
//   node scripts/bump-version.js <patch|minor|major|x.y.z> [--commit] [--tag] [--push]
//   pnpm version:bump -- patch --commit --tag

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [path.join(ROOT, 'package.json'), path.join(ROOT, 'svelte-app', 'package.json')];

function usageError(message) {
	console.error(message);
	console.error('Usage: node scripts/bump-version.js <patch|minor|major|x.y.z> [--commit] [--tag] [--push]');
	process.exit(1);
}

function parseVersion(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) return null;
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function nextVersion(current, bump) {
	if (bump === 'patch' || bump === 'minor' || bump === 'major') {
		const parsed = parseVersion(current);
		if (!parsed) usageError(`Current version "${current}" is not valid semver.`);
		if (bump === 'major') return `${parsed.major + 1}.0.0`;
		if (bump === 'minor') return `${parsed.major}.${parsed.minor + 1}.0`;
		return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
	}
	if (!parseVersion(bump)) usageError(`"${bump}" is not "patch", "minor", "major", or a valid x.y.z version.`);
	return bump;
}

function run(command, args) {
	execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
}

function detectIndent(raw) {
	const match = /\n([ \t]+)\S/.exec(raw);
	return match ? match[1] : '\t';
}

function main() {
	const args = process.argv.slice(2);
	const bumpArg = args.find((a) => !a.startsWith('--'));
	if (!bumpArg) usageError('Missing version argument.');

	const flags = new Set(args.filter((a) => a.startsWith('--')));
	const shouldCommit = flags.has('--commit') || flags.has('--tag') || flags.has('--push');
	const shouldTag = flags.has('--tag') || flags.has('--push');
	const shouldPush = flags.has('--push');

	const rootJson = JSON.parse(fs.readFileSync(TARGETS[0], 'utf8'));
	const currentVersion = rootJson.version;
	const newVersion = nextVersion(currentVersion, bumpArg);

	if (newVersion === currentVersion) {
		usageError(`New version "${newVersion}" is the same as the current version.`);
	}

	for (const file of TARGETS) {
		const raw = fs.readFileSync(file, 'utf8');
		const json = JSON.parse(raw);
		if (json.version !== currentVersion) {
			console.warn(`Warning: ${path.relative(ROOT, file)} was at ${json.version}, expected ${currentVersion}.`);
		}
		json.version = newVersion;
		fs.writeFileSync(file, JSON.stringify(json, null, detectIndent(raw)) + '\n');
		console.log(`Updated ${path.relative(ROOT, file)}: ${currentVersion} -> ${newVersion}`);
	}

	if (shouldCommit) {
		const relTargets = TARGETS.map((f) => path.relative(ROOT, f));
		run('git', ['add', ...relTargets]);
		run('git', ['commit', '-m', `chore: bump version to ${newVersion}`]);
	}

	if (shouldTag) {
		run('git', ['tag', `v${newVersion}`]);
	}

	if (shouldPush) {
		run('git', ['push']);
		run('git', ['push', 'origin', `v${newVersion}`]);
	}

	console.log(`\nVersion bumped to ${newVersion}.`);
	if (!shouldCommit) {
		console.log('Nothing was committed. Re-run with --commit (and --tag / --push) to do so.');
	}
}

main();

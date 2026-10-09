function replaceExactlyOnce(source, before, after, label) {
	const firstOccurrence = source.indexOf(before);
	const secondOccurrence = firstOccurrence < 0 ? -1 : source.indexOf(before, firstOccurrence + before.length);
	if (firstOccurrence < 0 && source.indexOf(after) >= 0) {
		console.log(`${label}: already patched`);
		return source;
	}
	if (firstOccurrence < 0 || secondOccurrence >= 0) {
		throw new Error(`${label}: expected exactly one match`);
	}
	console.log(`${label}: patched`);
	return Buffer.concat([
		source.subarray(0, firstOccurrence),
		after,
		source.subarray(firstOccurrence + before.length)
	]);
}

module.exports = { replaceExactlyOnce };

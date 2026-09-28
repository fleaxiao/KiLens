/* Appended to the unmodified occt-import-js distribution by bundle-3d.cjs. */
let importer;
self.onmessage = async event => {
    try {
        if (event.data.type === 'init') {
            importer = occtimportjs({ wasmBinary: event.data.wasm });
            // Report initialization errors through the waiting STEP request.
            importer.catch(() => {});
        } else if (event.data.type === 'step') {
            const occt = await importer;
            const result = occt.ReadStepFile(event.data.bytes, {
                linearUnit: 'millimeter', linearDeflectionType: 'absolute_value',
                linearDeflection: 0.05, angularDeflection: 0.5
            });
            self.postMessage(result);
        }
    } catch (error) { self.postMessage({ error: String(error.message || error) }); }
};

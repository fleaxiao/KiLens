import * as vscode from 'vscode';
import { activate as activatePreview } from '../web/extension';
import { setNativeModelDiscovery } from '../web/modelResolver';
import { createNativeDiscovery } from './modelDiscovery';

export function activate(context: vscode.ExtensionContext) {
    setNativeModelDiscovery(createNativeDiscovery());
    activatePreview(context);
}

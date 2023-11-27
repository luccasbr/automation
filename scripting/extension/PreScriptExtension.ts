import PreScript from '../preScript/PreScript';
import ScriptExtension from './ScriptExtension';

// TODO: auto-generate this type
export type ExtensionDependency = never;

export default abstract class PreScriptExtension extends ScriptExtension<PreScript, ExtensionDependency> {}

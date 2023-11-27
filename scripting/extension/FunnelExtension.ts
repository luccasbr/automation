import FunnelScript from '../funnel/FunnelScript';
import ScriptExtension from './ScriptExtension';

// TODO: auto-generate this type
export type ExtensionDependency = never;

export default abstract class FunnelExtension extends ScriptExtension<FunnelScript, ExtensionDependency> {}

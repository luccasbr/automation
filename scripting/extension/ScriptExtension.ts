export default abstract class ScriptExtension<Script, ExtensionDependency> {
  protected readonly script: Script;

  public abstract getDependencies(): ExtensionDependency[];
}

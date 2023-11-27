import Database from 'better-sqlite3';
import { ScriptExecution, ScriptExecutionCreateDto } from './models/ScriptExecution';
import { LogLevel } from '../scripting/Script';
import SerAny from 'serialize-anything';
import Timer from './models/Timer';
import { CachedVarCreateDto, CachedVarGetDto, CachedVar } from './models/CachedVar';
import { exec } from 'child_process';
import config from '../../config';

export default class LocalDb {
  private static instance: LocalDb;
  private db: Database.Database;

  constructor() {
    this.db = new Database('local.db');
  }

  public static getInstance(): LocalDb {
    if (!LocalDb.instance) {
      LocalDb.instance = new LocalDb();
    }

    return LocalDb.instance;
  }

  public initialize() {
    // create tables
    console.log(`Inicializando banco de dados local`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ScriptExecution (
        scriptId TEXT NOT NULL,
        automationId TEXT NOT NULL,
        stageName TEXT,
        funcName TEXT,
        execSequence INTEGER NOT NULL,
        internal BOOLEAN DEFAULT FALSE,
        args TEXT,
        cachedResult TEXT,
        error TEXT,
        execTime INTEGER NOT NULL,
        executedAt INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (scriptId, automationId, execSequence, executedAt)
      );

      CREATE TABLE IF NOT EXISTS ScriptLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scriptId TEXT NOT NULL,
        automationId TEXT NOT NULL,
        level TEXT NOT NULL,
        agent TEXT NOT NULL,
        text TEXT NOT NULL,
        data TEXT,
        createdAt INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS CachedVar (
        name TEXT NOT NULL,
        scriptId TEXT NOT NULL,
        execSequence INTEGER NOT NULL,
        internal BOOLEAN DEFAULT FALSE,
        value TEXT NOT NULL,
        PRIMARY KEY (name, scriptId, execSequence, internal)
      );

      CREATE TABLE IF NOT EXISTS Timer (
        name TEXT NOT NULL,
        scriptId TEXT NOT NULL,
        execSequence INTEGER NOT NULL,
        internal BOOLEAN DEFAULT FALSE,
        timeMs INTEGER NOT NULL,
        startedAt INTEGER,
        canceled BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (name, scriptId, execSequence, internal)
      );
    `);
    console.log(`Tabelas locais criadas`);
  }

  public setCachedVar<T>({ name, scriptId, execSequence, internal = false, value }: CachedVarCreateDto<T>) {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO CachedVar (name, scriptId, execSequence, internal, value) VALUES (?, ?, ?, ?, ?)',
      )
      .run(name, scriptId, execSequence, internal, SerAny.serialize(value));

    return value;
  }

  public getCachedVar<T>({
    name,
    scriptId,
    execSequence,
    internal = false,
    defaultValue,
  }: CachedVarGetDto & { defaultValue: T }): T {
    const result = this.db
      .prepare('SELECT value FROM CachedVar WHERE name = ? AND scriptId = ? AND execSequence = ? AND internal = ?')
      .get(name, scriptId, execSequence, internal) as CachedVar;

    if (!result) {
      this.setCachedVar({ name, scriptId, execSequence, internal, value: defaultValue });
    }

    return result ? SerAny.deserialize(JSON.parse(result.value)) : defaultValue;
  }

  public deleteCachedVar({ name, scriptId, execSequence, internal = false }: CachedVarGetDto) {
    this.db
      .prepare('DELETE FROM CachedVar WHERE id = ? AND scriptId = ? AND execSequence = ? AND internal = ?')
      .run(name, scriptId, execSequence, internal);
  }

  public clearScriptCachedVars({ scriptId }: { scriptId: string }) {
    this.db.prepare('DELETE FROM CachedVar WHERE scriptId = ?').run(scriptId);
  }

  public clearExecutionCachedVars({
    scriptId,
    execSequence,
    internal = false,
  }: {
    scriptId: string;
    execSequence: number;
    internal?: boolean;
  }) {
    this.db
      .prepare('DELETE FROM CachedVar WHERE scriptId = ? AND execSequence = ? AND internal = ?')
      .run(scriptId, execSequence, internal);
  }

  public getTimer({
    name,
    scriptId,
    execSequence,
    internal = false,
    timeMs,
  }: {
    name: string;
    scriptId: string;
    execSequence: number;
    internal?: boolean;
    timeMs: number;
  }): Timer {
    const result = this.db
      .prepare('SELECT * FROM Timer WHERE name = ? AND scriptId = ? AND execSequence = ?')
      .get(name, scriptId, execSequence) as any;

    let timer: Timer;

    if (result) {
      timer = result as Timer;
      timer.cached = true;
    } else {
      timer = new Timer({ name, scriptId, execSequence, timeMs, internal });
      this.db
        .prepare('INSERT INTO Timer (name, scriptId, execSequence, internal, timeMs) VALUES (?, ?, ?, ?, ?)')
        .run(name, scriptId, execSequence, internal, !timeMs || timeMs <= 0 ? config.defaultTimeoutSec * 1000 : timeMs);
    }

    return timer;
  }

  public startTimer(timer: Timer) {
    this.db
      .prepare('UPDATE Timer SET startedAt = ? WHERE name = ? AND scriptId = ? AND execSequence = ? AND internal = ?')
      .run(Date.now(), timer.name, timer.scriptId, timer.execSequence, timer.internal);
  }

  public cancelTimer(timer: Timer) {
    this.db
      .prepare('UPDATE Timer SET canceled = TRUE WHERE name = ? AND scriptId = ? AND execSequence = ? AND internal = ?')
      .run(timer.name, timer.scriptId, timer.execSequence, timer.internal);
  }

  public clearExecutionTimers({
    scriptId,
    execSequence,
    internal = false,
  }: {
    scriptId: string;
    execSequence: number;
    internal?: boolean;
  }) {
    this.db
      .prepare('DELETE FROM Timer WHERE scriptId = ? AND execSequence = ? AND internal = ?')
      .run(scriptId, execSequence, internal);
  }

  public clearScriptTimers({ scriptId }: { scriptId: string }) {
    this.db.prepare('DELETE FROM Timer WHERE scriptId = ?').run(scriptId);
  }

  public createScriptLog({
    scriptId,
    automationId,
    level,
    text,
    data,
  }: {
    scriptId: string;
    automationId: string;
    level: LogLevel;
    text: string;
    data?: string;
  }) {
    console.log(`[SCRIPT LOG]: ${scriptId} - ${automationId} - ${level} - ${text} - ${data}`);
    this.db
      .prepare('INSERT INTO ScriptLog (scriptId, automationId, level, text, data) VALUES (?, ?, ?, ?, ?)')
      .run(scriptId, automationId, level, text, data);
  }

  public findScriptExecution({
    scriptId,
    automationId,
    execSequence,
    internal = false,
  }: {
    scriptId: string;
    automationId: string;
    execSequence: number;
    internal?: boolean;
  }): ScriptExecution | undefined {
    return this.db
      .prepare(
        'SELECT * FROM ScriptExecution WHERE error IS NULL AND internal = ? AND execSequence = ? AND scriptId = ? AND automationId = ?',
      )
      .get(internal, execSequence, scriptId, automationId) as ScriptExecution | undefined;
  }

  public createScriptExecution({
    scriptId,
    automationId,
    stageName,
    funcName,
    execSequence,
    args,
    cachedResult,
    internal,
    error,
    execTime,
  }: ScriptExecutionCreateDto) {
    if (error) {
      console['logEmptyLine']();
      console.log(
        `SCRIPT EXECUTION: id: ${scriptId}${stageName ? `- stage: ${stageName}` : ''}${
          funcName ? `- func: ${funcName}` : ''
        }${args ? `\nARGS: ${JSON.stringify(args)}` : ''}\nERROR: ${error}`,
      );
    }

    this.db
      .prepare(
        'INSERT INTO ScriptExecution (scriptId, automationId, stageName, funcName, execSequence, internal, args, cachedResult, error, execTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        scriptId,
        automationId,
        stageName,
        funcName,
        execSequence,
        internal,
        args,
        cachedResult,
        error,
        execTime ? execTime : 0,
      );
  }
}

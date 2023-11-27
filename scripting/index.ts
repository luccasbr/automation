import { ScriptFunction } from './decorators';
import FunnelScript from './funnel/FunnelScript';
import { Funnel, Stage } from './funnel/decorators';
import PreScript from './preScript/PreScript';
import { PreFunnelScript } from './preScript/decortators';

export default {
  Funnel: Funnel,
  FunnelStage: Stage,
  PreFunnelScript: PreFunnelScript,
  ScriptFunction,
  FunnelScript: FunnelScript,
  PreScript: PreScript,
};

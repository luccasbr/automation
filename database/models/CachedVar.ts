export type CachedVar = {
  name: string;
  scriptId: string;
  execSequence: number;
  internal: boolean;
  value: string;
};

export type CachedVarCreateDto<T> = Optional<Omit<CachedVar, 'value'>, 'internal'> & { value: T };

export type CachedVarGetDto = Optional<Omit<CachedVar, 'value'>, 'internal'>;

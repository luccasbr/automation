import deepEqual from 'fast-deep-equal/es6';

export function RANDOMIZE<T>(...values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

export function RANDOMIZE_W<T>(...values: [number, T][]): T {
  const totalWeight = values.reduce((acc, [weight]) => acc + weight, 0);
  let random = Math.random() * totalWeight;

  for (const [weight, value] of values) {
    random -= weight;

    if (random <= 0) {
      return value;
    }
  }

  return values[values.length - 1][1];
}

export function RANDOMIZE_EXCEPT<T>(options: { exception: T; excludeIf?: (value: T) => boolean }, ...values: T[]): T {
  const filteredValues = values.filter((v) =>
    options.excludeIf ? !options.excludeIf(v) : !deepEqual(v, options.exception),
  );
  return RANDOMIZE(...filteredValues);
}

export function RANDOMIZE_EXCEPT_W<T>(
  options: { exception: T; excludeIf?: (value: T) => boolean },
  ...values: [number, T][]
): T {
  const filteredValues = values.filter(([, v]) =>
    options.excludeIf ? !options.excludeIf(v) : !deepEqual(v, options.exception),
  );
  return RANDOMIZE_W(...filteredValues);
}

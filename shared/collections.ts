/** Build ordered groups once instead of repeatedly scanning a collection for each parent. */
export function groupBy<T, K extends string | number>(
  items: readonly T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const value = key(item);
    const group = groups.get(value);
    if (group) {
      group.push(item);
    } else {
      groups.set(value, [item]);
    }
  }

  return groups;
}

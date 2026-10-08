export function throttleDb() {
  const records = new Map<string, { count: number; resetAt: Date }>();
  return {
    authThrottle: {
      findUnique: async ({ where }: any) => records.get(where.key) || null,
      deleteMany: async ({ where }: any) => {
        records.delete(where.key);
        return { count: 1 };
      },
    },
    $queryRaw: async (_sql: any, key: string, until: Date) => {
      const old = records.get(key);
      const row =
        old && old.resetAt > new Date()
          ? { ...old, count: old.count + 1 }
          : { count: 1, resetAt: until };
      records.set(key, row);
      return [row];
    },
  };
}

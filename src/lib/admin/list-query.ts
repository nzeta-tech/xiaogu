export type AdminListQuery = {
  page: number;
  limit: number;
  query: string;
  status: string;
};

export function parseAdminListQuery(request: Request, options: { defaultLimit?: number; maxLimit?: number } = {}): AdminListQuery {
  const params = new URL(request.url).searchParams;
  const page = Math.max(Number.parseInt(params.get("page") ?? "1", 10) || 1, 1);
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 500;
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? String(defaultLimit), 10) || defaultLimit, 1), maxLimit);
  return {
    page,
    limit,
    query: (params.get("q") ?? "").trim().toLowerCase().slice(0, 160),
    status: (params.get("status") ?? "all").trim().toLowerCase().slice(0, 40),
  };
}

export function filterAndPaginateAdminRows<T>(
  rows: T[],
  input: AdminListQuery,
  searchable: (row: T) => string,
  statusOf?: (row: T) => string,
) {
  const filtered = rows.filter((row) => {
    const matchesQuery = !input.query || searchable(row).toLowerCase().includes(input.query);
    const matchesStatus = input.status === "all" || !statusOf || statusOf(row).toLowerCase() === input.status;
    return matchesQuery && matchesStatus;
  });
  const start = (input.page - 1) * input.limit;
  return {
    rows: filtered.slice(start, start + input.limit),
    pagination: {
      page: input.page,
      limit: input.limit,
      total: filtered.length,
      pages: Math.max(Math.ceil(filtered.length / input.limit), 1),
    },
  };
}

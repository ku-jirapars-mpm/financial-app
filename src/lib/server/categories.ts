import type { Db } from "../db";

export interface CategoryRow {
  id: string;
  name: string;
  kind: "income" | "expense";
  is_archived: boolean;
  transaction_count: number;
}

export async function listCategories(db: Db, opts: { includeArchived?: boolean } = {}): Promise<CategoryRow[]> {
  const { rows } = await db.query<CategoryRow>(
    `select c.id, c.name, c.kind, c.is_archived,
            (select count(*)::int from transactions t where t.category_id = c.id and t.deleted_at is null) as transaction_count
     from categories c
     ${opts.includeArchived ? "" : "where not c.is_archived"}
     order by c.kind, c.is_archived, lower(c.name)`,
  );
  return rows;
}

export async function createCategory(db: Db, input: { name: string; kind: "income" | "expense" }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into categories (name, kind) values ($1, $2) returning id",
    [input.name, input.kind],
  );
  return rows[0]!.id;
}

/** Categories are archived rather than deleted so historical transactions keep their category. */
export async function setCategoryArchived(db: Db, id: string, archived: boolean): Promise<void> {
  await db.query("update categories set is_archived = $2 where id = $1", [id, archived]);
}

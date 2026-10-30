import { PageHeader } from "@/components/page-header";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withUserTransaction } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listCategories } from "@/lib/server/categories";
import { toggleCategoryArchivedAction } from "../actions";
import { NewCategoryForm } from "./new-category-form";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const categories = await withUserTransaction(user.id, (db) => listCategories(db, { includeArchived: true }));
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Categories" />
      <Card>
        <CardHeader>
          <CardTitle>Add category</CardTitle>
        </CardHeader>
        <CardContent>
          <NewCategoryForm />
        </CardContent>
      </Card>
      {(["expense", "income"] as const).map((kind) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle className="capitalize">{kind}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className={c.is_archived ? "text-muted-foreground line-through" : ""}>
                    {c.name} <span className="text-xs text-muted-foreground">({c.transaction_count})</span>
                  </span>
                  <form action={toggleCategoryArchivedAction} className="flex items-center gap-2">
                    {c.is_archived && <Badge tone="muted">archived</Badge>}
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="archived" value={String(!c.is_archived)} />
                    <button className="text-xs text-primary">{c.is_archived ? "Unarchive" : "Archive"}</button>
                  </form>
                </div>
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

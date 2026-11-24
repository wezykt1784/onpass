import Link from "next/link";
export default async function Page({ params }: PageProps<"/m/[org]/[menuId]/tablet">) {
  const { org, menuId } = await params;
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="mb-2 text-xl">Allergens on a tablet</h1>
        <p className="text-text-muted">Large-type version for staff to go through allergens with a guest. Arrives in milestone 3. For now use the <Link className="font-semibold text-accent underline" href={`/m/${org}/${menuId}`}>guest menu</Link>.</p>
      </div>
    </main>
  );
}

import { Database, Globe, Plus } from 'lucide-react';
import type { Category } from '../../shared/types';
import { PageHeader } from '../components/Bits';
import { ServiceCard } from '../components/ServiceCard';
import { openCreateDialog } from '../dialogs/CreateService';
import { openRuntimesDialog } from '../dialogs/Runtimes';
import { CATEGORIES } from '../lib/services';
import { useAppState } from '../lib/store';

export function CategoryPage({ category }: { category: Category }) {
  const cfg = CATEGORIES[category];
  const services = useAppState((s) => s.services);
  const list = services.filter((s) => s.category === category);
  const Icon = category === 'database' ? Database : Globe;

  return (
    <>
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        createLabel={`${cfg.singular} erstellen`}
        settingsLabel={`${cfg.title}-Einstellungen`}
        onCreate={() => openCreateDialog(category)}
        onSettings={() => openRuntimesDialog(category)}
      />
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {list.length === 0 ? (
          <div className="card border-dashed flex flex-col items-center text-center px-6 py-16">
            <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
              <Icon className="size-7" />
            </div>
            <h2 className="mt-5 text-base font-semibold text-neutral-100">{cfg.emptyTitle}</h2>
            <p className="mt-1.5 text-sm text-neutral-500 max-w-sm">{cfg.emptyText}</p>
            <button className="btn btn-primary mt-6" onClick={() => openCreateDialog(category)}>
              <Plus className="size-4" />
              {cfg.singular} erstellen
            </button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {list.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

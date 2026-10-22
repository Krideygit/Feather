import { useState } from 'react';
import { PageHeader } from '../components/Bits';
import { ServiceCard } from '../components/ServiceCard';
import { openCreateDialog, openPackageChooser } from '../dialogs/CreateService';
import { openRuntimesDialog } from '../dialogs/Runtimes';
import { GROUPS, PACKAGES, isAvailable, type PackageDef } from '../lib/packages';
import { useAppState } from '../lib/store';

function PackageCard({ pkg }: { pkg: PackageDef }) {
  const available = isAvailable(pkg);
  return (
    <div className={`card p-4 flex flex-col ${available ? 'card-hover' : 'opacity-75'}`}>
      <div className="flex items-start gap-3">
        <div className={`size-10 rounded-lg grid place-items-center shrink-0 ${available ? 'bg-primary/10 text-primary' : 'bg-neutral-800 text-neutral-300'}`}>
          <pkg.icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-neutral-100">{pkg.name}</h3>
          <p className="text-sm text-neutral-500 mt-1">{pkg.description}</p>
        </div>
        {!available && <span className="text-[11px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5 shrink-0">Bald</span>}
      </div>
      {available && (
        <div className="mt-4 pt-3 border-t border-neutral-800">
          <button className="btn btn-primary btn-sm" onClick={() => openCreateDialog('package', pkg)} data-package={pkg.id}>
            Installieren
          </button>
        </div>
      )}
    </div>
  );
}

export function PackagesPage() {
  const services = useAppState((s) => s.services);
  const [filter, setFilter] = useState<string>('all');
  const mine = services.filter((s) => s.category === 'package');
  const groups = GROUPS.filter((g) => filter === 'all' || g.id === filter);

  return (
    <>
      <PageHeader
        title="Packages"
        description="Fertige Server und Werkzeuge, nach Kategorien sortiert."
        createLabel="Package hinzufügen"
        settingsLabel="Package-Einstellungen"
        onCreate={openPackageChooser}
        onSettings={() => openRuntimesDialog('package')}
      />
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {mine.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium text-neutral-400 mb-3">Deine Packages</h2>
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
              {mine.map((s) => (
                <ServiceCard key={s.id} service={s} />
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-2 mb-5" role="tablist">
          {[{ id: 'all', label: 'Alle', icon: null }, ...GROUPS].map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={filter === g.id}
              className={`inline-flex items-center gap-2 h-8 px-3 rounded-full text-[13px] font-medium border transition-colors ${filter === g.id ? 'border-primary bg-primary/10 text-primary' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'}`}
              onClick={() => setFilter(g.id)}
              data-group={g.id}
            >
              {g.icon && <g.icon className="size-3.5" />}
              {g.label}
            </button>
          ))}
        </div>

        <div className="space-y-8">
          {groups.map((group) => {
            const items = PACKAGES.filter((p) => p.group === group.id);
            return (
              <section key={group.id}>
                <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-300 mb-3">
                  <group.icon className="size-4 text-primary" />
                  {group.label}
                  <span className="text-xs font-normal text-neutral-600">{items.length}</span>
                </h2>
                <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                  {items.map((pkg) => (
                    <PackageCard key={pkg.id} pkg={pkg} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

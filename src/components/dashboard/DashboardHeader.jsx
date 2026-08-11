export default function DashboardHeader({ title, subtitle, filters, companyName, infoItems = [] }) {
  return (
    <div className="mb-6">
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
        </div>
        {filters && <div className="flex gap-3 items-center">{filters}</div>}
      </div>

      {companyName && (
        <div className="p-4 rounded-xl bg-primary text-primary-foreground flex flex-wrap items-center gap-4 justify-between">
          <div className="font-semibold text-lg">{companyName}</div>
          <div className="flex flex-wrap gap-4 text-sm">
            {infoItems.map((item) => (
              <span key={item.label}>{item.label}: <strong>{item.value}</strong></span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
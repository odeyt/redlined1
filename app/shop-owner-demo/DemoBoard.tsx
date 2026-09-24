/**
 * A static picture of the Vehicle Management Kanban view.
 *
 * There is no approved screenshot or video of the board, so this is drawn in
 * HTML instead: it loads with the page, stays sharp at any width, and reads
 * to a screen reader as a list rather than an image.
 *
 * It follows the real board (features/vehicles/VehiclesView.tsx,
 * KANBAN_COLUMNS): the same column names, a count on every column header, and
 * cards showing the vehicle, its customer, its plate and the assigned
 * technicians. Four of the real seven columns are shown to fit the space.
 *
 * Every vehicle, name and plate is invented, and the component says so on its
 * face. No VIN appears, even a made-up one.
 */

type Card = { vehicle: string; customer: string; plate: string; techs: string[] };
type Column = { key: string; label: string; tone: 'approval' | 'progress' | 'parts' | 'done'; cards: Card[] };

export const DEMO_COLUMNS: Column[] = [
  {
    key: 'approval', label: 'Pending Customer Approval', tone: 'approval',
    cards: [
      { vehicle: '2019 Ford F-150', customer: 'J. Alvarez', plate: '8KTR214', techs: ['Mike R.'] },
      { vehicle: '2021 Honda CR-V', customer: 'D. Chen', plate: '7BNL902', techs: ['Sam T.'] },
    ],
  },
  {
    key: 'parts', label: 'Pending Parts', tone: 'parts',
    cards: [
      { vehicle: '2017 Chevrolet Silverado', customer: 'R. Patel', plate: '5WXD118', techs: ['Luis G.'] },
      { vehicle: '2020 Toyota Camry', customer: 'K. Brooks', plate: '9FJM447', techs: ['Mike R.'] },
    ],
  },
  {
    key: 'progress', label: 'Work In Progress', tone: 'progress',
    cards: [
      { vehicle: '2018 Jeep Wrangler', customer: 'T. Nguyen', plate: '6HPA350', techs: ['Luis G.'] },
      { vehicle: '2022 Subaru Outback', customer: 'M. Ortiz', plate: '4CRE671', techs: ['Sam T.'] },
      { vehicle: '2016 Nissan Altima', customer: 'A. Wright', plate: '3LKV285', techs: ['Mike R.', 'Luis G.'] },
    ],
  },
  {
    key: 'done', label: 'Completed', tone: 'done',
    cards: [
      { vehicle: '2015 Ford Escape', customer: 'P. Singh', plate: '2TQB509', techs: ['Sam T.'] },
    ],
  },
];

export function DemoBoard() {
  return (
    <figure className="sod-board" aria-labelledby="sod-board-caption">
      <div className="sod-board-chrome">
        <span className="sod-board-title">Vehicle Management · Kanban</span>
        <span className="sod-demo-badge">Illustrative demo data</span>
      </div>
      <div className="sod-board-scroll" tabIndex={0} aria-label="Example vehicle board, scrollable">
        <div className="sod-board-cols">
          {DEMO_COLUMNS.map(col => (
            <section key={col.key} className={`sod-col sod-col-${col.tone}`} aria-label={`${col.label}, ${col.cards.length} vehicles`}>
              <header className="sod-col-head">
                <span>{col.label}</span>
                <span className="sod-col-count" aria-hidden="true">{col.cards.length}</span>
              </header>
              <ul className="sod-col-cards">
                {col.cards.map(card => (
                  <li key={card.plate} className="sod-card">
                    <div className="sod-card-vehicle">{card.vehicle}</div>
                    <div className="sod-card-meta">{card.customer} · <span className="sod-mono">{card.plate}</span></div>
                    <div className="sod-card-techs" aria-label={`Technicians: ${card.techs.join(', ')}`}>
                      {card.techs.map(t => <span key={t} className="sod-tech">{t}</span>)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      <figcaption id="sod-board-caption" className="sod-board-caption">
        How the Vehicle Management board lays out a shop day. Illustrative demo data — the vehicles, customers,
        plates and technicians shown are fictional.
      </figcaption>
    </figure>
  );
}

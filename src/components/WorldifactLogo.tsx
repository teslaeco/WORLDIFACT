import reference from '../assets/forge-logo-reference.png';

/** Three views of the owner's FORGE F2 image; the supplied bitmap is unmodified. */
export default function WorldifactLogo() {
  return <svg className="worldifact-logo" viewBox="0 0 180 150" role="img" aria-label="WORLDIFACT: three FORGE polyhedra, two below and one above">
    {[[49, 0], [5, 66], [92, 66]].map(([x, y]) =>
      <svg key={x} x={x} y={y} width="83" height="80" viewBox="331 516 253 233" overflow="hidden">
        <image href={reference} width="899" height="2048" />
      </svg>)}
  </svg>;
}

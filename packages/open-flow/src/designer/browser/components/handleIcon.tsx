import { forwardRef } from 'react'

/** This two-color icon uses inline SVG because UnoCSS cannot construct it. */
export const HandleIcon: React.ForwardRefExoticComponent<Omit<React.SVGProps<SVGSVGElement>, 'ref'> & React.RefAttributes<SVGSVGElement>> =
  /*#__PURE__*/ forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16" ref={ref} {...props}>
      <circle cx="8" cy="8" r="5.5" stroke="var(--text-weak)" />
      <circle cx="8" cy="8" r="3" fill="var(--brand-highlight-color)" />
    </svg>
  ))

/** Locally drawn UIUC-inspired dome: no external images or tracking. */
export default function IllinoisHeroArt(){
 return <svg className="illinois-hero-art" viewBox="0 0 540 420" aria-hidden="true" focusable="false">
  <defs>
   <radialGradient id="ivrGlow">
    <stop stopColor="#ff5f05" stopOpacity=".4"/>
    <stop offset="1" stopColor="#ff5f05" stopOpacity="0"/>
   </radialGradient>
   <linearGradient id="ivrRoof" x1="0" x2="1" y1="0" y2="1">
    <stop stopColor="#ffb16b" stopOpacity=".3"/>
    <stop offset="1" stopColor="#ff5f05" stopOpacity=".06"/>
   </linearGradient>
   <linearGradient id="ivrPillar" x1="0" x2="0" y1="0" y2="1">
    <stop stopColor="#426da4"/><stop offset="1" stopColor="#091a34"/>
   </linearGradient>
  </defs>
  <ellipse cx="290" cy="290" rx="280" ry="200" fill="url(#ivrGlow)"/>
  <path d="M0 349Q90 329 159 350Q245 329 320 346Q431 322 540 347V420H0Z" fill="#061731" opacity=".9"/>
  <rect x="105" y="307" width="371" height="113" fill="#091e3e"/>
  <path d="M121 315Q126 229 199 186Q291 125 386 186Q456 232 462 315Z" fill="url(#ivrRoof)" stroke="#e86d26" strokeWidth="3"/>
  <path d="M291 151V108M280 130H302" stroke="#ffb16b" strokeWidth="4"/>
  <path d="M234 179Q292 162 349 179" fill="none" stroke="#f98b3f" strokeWidth="4"/>
  <path d="M174 244Q291 190 413 244M148 283Q291 248 439 283M128 311H459" fill="none" stroke="#ff8a38" strokeWidth="2" opacity=".75"/>
  <path d="M241 185Q218 244 215 314M291 175V315M342 185Q368 241 370 315" fill="none" stroke="#ffae70" strokeWidth="2" opacity=".65"/>
  <rect x="90" y="308" width="400" height="19" fill="#d96d2a"/>
  <rect x="80" y="327" width="420" height="14" fill="#1a3459" stroke="#f38949" strokeWidth="2"/>
  {[126,186,246,306,366,426].map(x=><g key={x}>
   <rect x={x} y="345" width="32" height="65" fill="url(#ivrPillar)" stroke="#43648e" strokeWidth="2"/>
   <rect x={x-6} y="343" width="44" height="8" fill="#e17b39"/>
   <rect x={x-3} y="408" width="38" height="9" fill="#284e7b"/>
  </g>)}
  <rect x="64" y="417" width="452" height="10" fill="#ec742d"/>
  <path d="M0 395Q45 304 72 293Q54 353 99 416H0Z" fill="#f46b22" fillOpacity=".75"/>
  <path d="M0 344Q37 282 69 257Q44 308 80 343Q33 319 0 372" fill="none" stroke="#ff8e40" strokeWidth="10" strokeLinecap="round"/>
  <path d="M479 404Q501 333 540 306V420H484Z" fill="#e45f1c" fillOpacity=".7"/>
  <path d="M471 349Q499 289 540 275M483 381Q507 331 539 322" fill="none" stroke="#ff8e40" strokeWidth="9" strokeLinecap="round"/>
 </svg>;
}

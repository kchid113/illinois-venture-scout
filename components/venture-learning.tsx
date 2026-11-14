import Link from 'next/link';
import {ArrowRight,BookOpen,CheckCircle2,ExternalLink,GraduationCap,Lightbulb,Search,ShieldCheck} from 'lucide-react';

const glossary=[
 {term:'Venture capital (VC)',meaning:'Money invested in businesses with high growth potential. Investors accept substantial risk in exchange for ownership, rather than a guaranteed return.'},
 {term:'Pre-seed / seed',meaning:'Early funding stages. Pre-seed often supports initial exploration or product development; seed funding can help a company test and grow a business. Labels vary by investor.'},
 {term:'Incubator',meaning:'An organization that helps early companies with resources such as workspace, mentors, and business support. Participation does not itself mean an investment was made.'},
 {term:'Accelerator',meaning:'A structured program that helps founders develop and grow a business, often over a defined period. Some programs invest and others do not.'},
 {term:'University spinout',meaning:'A business built around university-developed intellectual property or research. A research-park tenant or student-founded company is not automatically a spinout.'},
 {term:'Due diligence',meaning:'The process of checking a business before deciding whether to invest: product, market, customers, people, finances, legal issues, and evidence.'},
 {term:'Equity funding',meaning:'Capital provided in exchange for ownership or rights that may become ownership. Grants, contracts, and research awards are different funding mechanisms.'},
 {term:'Traction',meaning:'Evidence that customers or users want what a company offers. Meaningful examples depend on the business and require real, company-specific support.'},
 {term:'Source-backed claim',meaning:'A factual statement with a traceable supporting document. A source may report what a company says without independently proving its commercial performance.'},
 {term:'Not verified',meaning:'The available evidence does not establish this fact. It does not mean the company lacks funding, customers, a product, or a working business.'}
];

export default function VentureLearning(){
 return <div className="learn-page">
  <div className="page-heading"><div><div className="eyebrow"><GraduationCap size={15}/> LEARN THE BASICS</div><h1>Startup investing, explained simply.</h1><p>Learn what investors look for, how to research a startup, and how to interpret the evidence on Illinois Venture Radar.</p></div></div>
  <section className="learn-intro panel">
   <div><span className="learn-kicker"><Lightbulb size={16}/> START HERE</span><h2>You do not need a finance background to explore startups.</h2><p>Every good research question begins with three basics: What does this company build? Who might need it? And how do we know?</p><Link href="/discover" className="button primary">Explore a real company <ArrowRight size={16}/></Link></div>
   <div className="learning-callout"><ShieldCheck size={28}/><strong>Facts, not guesses</strong><p>Published research links to its original evidence. Unknown details stay unknown, and every source can be inspected.</p></div>
  </section>
  <div className="section-heading"><div><div className="eyebrow">A SIMPLE PROCESS</div><h2>How to research a startup in four steps</h2><p>These steps help organize questions; they do not predict investment returns.</p></div></div>
  <div className="learn-step-grid">
   <article className="panel learning-step"><span>01</span><Search size={24}/><h3>Find a company</h3><p>Search by name, technology, industry, or documented Illinois affiliation.</p><Link href="/discover">Browse startups <ArrowRight size={14}/></Link></article>
   <article className="panel learning-step"><span>02</span><BookOpen size={24}/><h3>Understand the business</h3><p>Read its product description and ask who would use the product and why.</p></article>
   <article className="panel learning-step"><span>03</span><ShieldCheck size={24}/><h3>Check the evidence</h3><p>Open the original source. Note what it proves—and what it cannot establish.</p><Link href="/sources">See the sources <ArrowRight size={14}/></Link></article>
   <article className="panel learning-step"><span>04</span><CheckCircle2 size={24}/><h3>Save questions</h3><p>Add companies to your watchlist, compare them, and record what you still need to learn.</p><Link href="/watchlists">My research <ArrowRight size={14}/></Link></article>
  </div>
  <section className="learn-checklist panel padded">
   <div><div className="eyebrow">RESEARCH QUESTIONS</div><h2>What makes a startup worth investigating?</h2><p>A startup is more than a sector label or funding announcement. These are useful questions to examine, not a formula for success.</p></div>
   <ul><li>Is there evidence of a genuine customer problem?</li><li>What is distinctive about the product or technology?</li><li>Who are the founders and what relevant experience do they have?</li><li>Is there evidence of adoption, repeat use, or revenue?</li><li>What outside funding, grants, or contracts are documented?</li><li>What information is missing or contradictory?</li></ul>
  </section>
  <section className="section-block">
   <div className="section-heading"><div><div className="eyebrow">PLAIN-ENGLISH GLOSSARY</div><h2>Venture capital terms, without the jargon</h2><p>Select any term to learn what it means.</p></div></div>
   <div className="glossary-grid">{glossary.map(item=><details key={item.term} className="glossary-item"><summary>{item.term}</summary><p>{item.meaning}</p></details>)}</div>
  </section>
  <section className="learn-footer panel padded">
   <ShieldCheck size={24}/><div><h2>How trustworthy is the data?</h2><p>Illinois Venture Radar is independent, not university-endorsed, and is not an investment recommendation engine. A documented ecosystem relationship is not proof of university ownership, investment, or company traction. Source checks are not the same as business developments.</p><div className="row"><Link href="/methodology">Read our methodology <ExternalLink size={14}/></Link><Link href="/sources">Browse original sources <ExternalLink size={14}/></Link></div></div>
  </section>
 </div>;
}

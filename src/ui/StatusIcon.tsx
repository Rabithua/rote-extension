import { Check, AlertCircle } from 'lucide-react';

export function StatusIcon({ state }: { state: 'saving' | 'saved' | 'error' }) {
  return <span className="rote-state-icon" aria-hidden="true">
    <span data-active={state === 'saving'}><span className="rote-spinner" /></span>
    <span data-active={state === 'saved'}><Check size={14} /></span>
    <span data-active={state === 'error'}><AlertCircle size={14} /></span>
  </span>;
}

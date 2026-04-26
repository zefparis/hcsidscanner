/**
 * Stepper — visual progress for the 3-step KYC flow.
 */

import { Check, Loader2, X } from 'lucide-react';

import { STATUS_COLOR, theme } from '../lib/theme';
import type { StepStatus, StepperState } from '@hcs/id-scanner-core';

const STEPS: { id: keyof StepperState; label: string }[] = [
  { id: 'document', label: 'Document' },
  { id: 'faceMatch', label: 'Selfie' },
  { id: 'result', label: 'Verdict' },
];

function StatusGlyph({ status }: { status: StepStatus }) {
  if (status === 'SUCCESS') return <Check size={14} />;
  if (status === 'FAILED') return <X size={14} />;
  if (status === 'PROCESSING')
    return <Loader2 size={14} className="hcs-spin" />;
  return null;
}

export function Stepper({ steps }: { steps: StepperState }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '14px 16px',
        background: theme.bgElev,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
      }}
    >
      {STEPS.map((step, idx) => {
        const status = steps[step.id];
        const color = STATUS_COLOR[status];
        return (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                border: `1px solid ${color}`,
                background:
                  status === 'PENDING' ? 'transparent' : 'rgba(0,200,255,0.06)',
                color,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: `1px solid ${color}`,
                  fontSize: 11,
                }}
              >
                {status === 'PENDING' ? idx + 1 : <StatusGlyph status={status} />}
              </span>
              {step.label.toUpperCase()}
            </div>
            {idx < STEPS.length - 1 && (
              <div
                style={{
                  width: 18,
                  height: 1,
                  background: theme.border,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// app/generation/staff.tsx - Generation & PR for office staff: every client (or one chosen client), the same views a client sees.
// Backend: /api/generation/staff/* (operations / ci_admin / admin). Opened from the staff Overview.
import React from 'react';
import GenerationCentre from '../../src/components/GenerationCentre';

export default function StaffGenerationScreen() {
  return <GenerationCentre scope="staff" />;
}

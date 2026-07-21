import type { DeskSummary } from '@/components/office/types';

export type DeskAttentionItem = {
  id: string;
  caseId: string;
  person: string;
  item: string;
  owner: string;
  assignedToId: string | null;
  reason: string;
  nextAction: string;
  dueAt: string | null;
  priority: string;
  restricted: boolean;
  updatedAt: string;
};

export type DeskActivityItem = {
  id: string;
  person: string;
  item: string;
  kind: string;
  summary: string;
  channel: string;
  result: string;
  link: string | null;
  createdAt: string;
};

export type OfficeDeskPayload = {
  summary: DeskSummary;
  attention: DeskAttentionItem[];
  activity: DeskActivityItem[];
  viewerId: string | null;
};

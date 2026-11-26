import { useContext, type Accessor } from 'solid-js';
import { meetingRecordsQuery } from '../../meetings/records';
import { AuthContext } from '../context';
import { createQuery } from '../query';

/** Rekordy ustanowione w partiach spotkania (`meetingRecordsQuery`), wersja Solid `useMeetingRecords`. */
export function createMeetingRecords(meetingId: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => meetingRecordsQuery(auth.client, meetingId()));
}

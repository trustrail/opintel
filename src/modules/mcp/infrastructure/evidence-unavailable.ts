import {DomainError,err} from '../../../shared/kernel/index.js';
import type {EvidenceWriterPort} from '../application/query-ports.js';
export class UnavailableEvidenceWriter implements EvidenceWriterPort {
 readonly implementation='unavailable' as const;
 async open(){return err(new DomainError('dependency_unavailable','Query is unavailable until item 5.10 and item 5.11 provide durable evidence. No query was executed.'));}
 async close(){return err(new DomainError('dependency_unavailable','Durable evidence requires item 5.10 and item 5.11.'));}
}

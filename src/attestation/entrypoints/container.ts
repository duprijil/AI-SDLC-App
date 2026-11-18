import { join } from "node:path";

import type { AttestationStorePort } from "@/attestation/adapters/attestation_store_port";
import { AttestationStoreSqlite } from "@/attestation/adapters/attestation_store_sqlite";
import { FindAttestation } from "@/attestation/use_cases/find_attestation";
import { RecordAttestation } from "@/attestation/use_cases/record_attestation";
import { loadProjectConfig, type ProjectConfig } from "@/config";

const CACHE_FILE_NAME = "cache.sqlite";

export class AttestationContainer {
  readonly #store: AttestationStorePort;

  constructor() {
    const config: ProjectConfig = loadProjectConfig();
    this.#store = new AttestationStoreSqlite(join(config.appDataRoot, CACHE_FILE_NAME));
  }

  findAttestation(): FindAttestation {
    return new FindAttestation(this.#store);
  }

  recordAttestation(): RecordAttestation {
    return new RecordAttestation(this.#store);
  }
}

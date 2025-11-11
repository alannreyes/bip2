# 🔄 SOLUCIÓN COMPLETA CON HEARTBEAT

## Estrategia: Sistema completo de checkpoints + heartbeat

### 1. Agregar campos a SyncJob entity

```typescript
// Modificar sync-job.entity.ts
@Column({ type: 'int', default: 0 })
lastProcessedOffset: number;

@Column({ type: 'timestamp', nullable: true })
lastHeartbeat: Date | null;

@Column({ type: 'jsonb', nullable: true })
checkpointData: {
  batchIndex?: number;
  lastSuccessfulOffset?: number;
  retryCount?: number;
  estimatedTimeRemaining?: number;
} | null;
```

### 2. Servicio de Checkpoint

```typescript
// Nuevo: checkpoint.service.ts
@Injectable()
export class CheckpointService {
  
  async saveCheckpoint(jobId: string, checkpoint: CheckpointData): Promise<void> {
    await this.syncJobRepository.update(jobId, {
      lastProcessedOffset: checkpoint.offset,
      lastHeartbeat: new Date(),
      checkpointData: {
        batchIndex: checkpoint.batchIndex,
        lastSuccessfulOffset: checkpoint.offset,
        retryCount: checkpoint.retryCount || 0,
        estimatedTimeRemaining: checkpoint.estimatedTimeRemaining,
      }
    });
  }

  async getCheckpoint(jobId: string): Promise<CheckpointData | null> {
    const job = await this.syncJobRepository.findOne({ where: { id: jobId } });
    
    if (!job || job.lastProcessedOffset === 0) {
      return null;
    }

    // Verificar si el heartbeat es reciente (últimos 5 minutos)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isStale = !job.lastHeartbeat || job.lastHeartbeat < fiveMinutesAgo;

    return {
      offset: job.lastProcessedOffset,
      batchIndex: job.checkpointData?.batchIndex || 0,
      isStale,
      canResume: !isStale || job.status === 'failed'
    };
  }

  async heartbeat(jobId: string): Promise<void> {
    await this.syncJobRepository.update(jobId, {
      lastHeartbeat: new Date()
    });
  }
}
```

### 3. Full Sync Processor Mejorado

```typescript
@Process('full-sync')
async handleFullSync(job: Job) {
  const { jobId, datasourceId } = job.data;
  
  // Heartbeat cada 30 segundos
  const heartbeatInterval = setInterval(() => {
    this.checkpointService.heartbeat(jobId);
  }, 30000);

  try {
    // 🔍 RECUPERAR CHECKPOINT
    const checkpoint = await this.checkpointService.getCheckpoint(jobId);
    let startBatchIndex = 0;
    
    if (checkpoint?.canResume) {
      startBatchIndex = checkpoint.batchIndex;
      this.logger.log(`🔄 RESUMING from batch ${startBatchIndex} (offset: ${checkpoint.offset})`);
    }

    await this.syncService.updateJobStatus(jobId, 'running');
    
    const datasource = await this.datasourcesService.findOne(datasourceId);
    const connector = this.getConnector(datasource.type);
    const totalCount = await this.getTotalCount(datasource, connector);
    
    const batchSize = 100;
    const totalBatches = Math.ceil(totalCount / batchSize);

    for (let batchIndex = startBatchIndex; batchIndex < totalBatches; batchIndex++) {
      const offset = batchIndex * batchSize;

      try {
        const result = await connector.executeQuery(
          datasource.connectionConfig,
          datasource.queryTemplate,
          { offset, limit: batchSize }
        );

        if (result.rows.length === 0) break;

        await this.processBatch(jobId, datasource, result.rows);

        // 💾 GUARDAR CHECKPOINT cada batch
        await this.checkpointService.saveCheckpoint(jobId, {
          offset: offset + batchSize,
          batchIndex: batchIndex + 1,
          estimatedTimeRemaining: this.calculateETA(batchIndex, totalBatches, job.data.startTime)
        });

        job.progress((batchIndex + 1) / totalBatches * 100);

      } catch (error) {
        // Incrementar retry count en checkpoint
        await this.checkpointService.saveCheckpoint(jobId, {
          offset: offset,
          batchIndex: batchIndex,
          retryCount: (checkpoint?.retryCount || 0) + 1
        });
      }
    }

    clearInterval(heartbeatInterval);
    await this.syncService.updateJobStatus(jobId, 'completed');
    
  } catch (error) {
    clearInterval(heartbeatInterval);
    await this.syncService.updateJobStatus(jobId, 'failed');
    throw error;
  }
}

private calculateETA(currentBatch: number, totalBatches: number, startTime: number): number {
  const elapsed = Date.now() - startTime;
  const batchesRemaining = totalBatches - currentBatch;
  const avgTimePerBatch = elapsed / currentBatch;
  return Math.round(avgTimePerBatch * batchesRemaining / 1000); // segundos
}
```

## ✅ Ventajas:
- **Checkpoint por batch** (cada 100 registros)
- **Heartbeat system** previene jobs zombie
- **ETA calculation** para mejor UX
- **Retry tracking** para batches fallidos
- **Detección de jobs stale**

## ⚠️ Consideraciones:
- **Requiere migración de BD** (nuevos campos)
- **Implementación 2-3 horas**
- **Mayor complejidad**
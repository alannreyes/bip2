# 🧠 SOLUCIÓN DETECCIÓN INTELIGENTE

## Estrategia: Detectar restart vs job nuevo

```typescript
// Nuevo método en sync.service.ts
async checkIfJobShouldResume(jobId: string): Promise<{ shouldResume: boolean, lastOffset: number }> {
  const job = await this.syncJobRepository.findOne({ where: { id: jobId } });
  
  // Si ya tiene registros procesados pero status no es 'completed'
  if (job.processedRecords > 0 && job.status !== 'completed') {
    this.logger.log(`🔄 RESTART DETECTED: Job ${jobId} has ${job.processedRecords} processed records`);
    
    // Calcular último offset basado en registros procesados
    const batchSize = 100;
    const lastOffset = Math.floor(job.processedRecords / batchSize) * batchSize;
    
    return { shouldResume: true, lastOffset };
  }
  
  return { shouldResume: false, lastOffset: 0 };
}
```

## Modificación en full-sync.processor.ts

```typescript
@Process('full-sync')
async handleFullSync(job: Job) {
  const { jobId, datasourceId } = job.data;
  
  try {
    // 🆕 DETECCIÓN INTELIGENTE DE RESTART
    const resumeInfo = await this.syncService.checkIfJobShouldResume(jobId);
    
    if (resumeInfo.shouldResume) {
      this.logger.log(`🎯 SMART RESUME: Starting from record ${resumeInfo.lastOffset}`);
    } else {
      this.logger.log(`🆕 NEW SYNC: Starting from beginning`);
    }

    await this.syncService.updateJobStatus(jobId, 'running');
    
    const datasource = await this.datasourcesService.findOne(datasourceId);
    const connector = this.getConnector(datasource.type);
    
    const totalCount = await this.getTotalCount(datasource, connector);
    
    const batchSize = 100;
    const startBatchIndex = Math.floor(resumeInfo.lastOffset / batchSize);
    const totalBatches = Math.ceil(totalCount / batchSize);

    this.logger.log(`📊 RESUME STATS: Starting batch ${startBatchIndex + 1}/${totalBatches}`);

    for (let batchIndex = startBatchIndex; batchIndex < totalBatches; batchIndex++) {
      const offset = batchIndex * batchSize;

      try {
        const result = await connector.executeQuery(
          datasource.connectionConfig,
          datasource.queryTemplate,
          { offset, limit: batchSize },
        );

        if (result.rows.length === 0) break;

        await this.processBatch(jobId, datasource, result.rows);
        job.progress((batchIndex + 1) / totalBatches * 100);

      } catch (error) {
        this.logger.error(`Batch ${batchIndex + 1} failed: ${error.message}`);
      }
    }

    await this.syncService.updateJobStatus(jobId, 'completed');
    
  } catch (error) {
    await this.syncService.updateJobStatus(jobId, 'failed');
    throw error;
  }
}
```

## ✅ Ventajas:
- **Cero configuración adicional**
- **Usa datos existentes** (processedRecords)
- **Detección automática** de restarts
- **Implementación 1 hora**

## ⚠️ Limitaciones:
- Granularidad de 100 registros (tamaño batch)
- No persiste progreso durante ejecución
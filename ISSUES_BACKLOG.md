# 🐛 ISSUES & BACKLOG - BIP2

## 🚨 CRITICAL ISSUES

### #001 - Sync Job Status Desynchronization
**Priority:** P0 (Blocker)  
**Status:** Open  
**Detected:** 2025-11-10 16:10 GMT-5  
**Reporter:** GitHub Copilot (Automated Diagnosis)  

#### **Problem Statement**
Sync jobs continue processing in background after being marked as "failed" in the database/API, making it impossible to monitor real progress.

#### **Evidence**
```
Job ID: d8950e43-4b35-418d-a140-5bd0a36b79c6
API Status: "failed" 
Real Status: Processing ~18,100+ records (9% of 202,910)
Expected: Status should update to "running" and show real progress
```

#### **Impact**
- ❌ Cannot monitor sync progress via UI/API
- ❌ Users think sync failed when it's actually working  
- ❌ May create duplicate jobs unknowingly
- ❌ Resource usage unclear (CPU, memory, DB connections)

#### **Root Cause Analysis**
1. **Bull Queue Processor** runs independently
2. **Database updates** via `syncService.updateJobStatus()` fail silently
3. **No heartbeat mechanism** to detect zombie jobs
4. **Timeout mechanism** marks jobs as failed prematurely

#### **Technical Details**
- **File:** `/backend/src/sync/processors/full-sync.processor.ts`
- **Method:** `handleFullSync()` around line 58
- **Service:** `syncService.updateJobStatus()` 
- **Queue:** Bull Redis queue continues processing
- **DB Entity:** `SyncJob.status` not updating correctly

#### **Proposed Solution**
```typescript
// 1. Add job heartbeat
setInterval(() => {
  this.syncService.updateJobHeartbeat(jobId);
}, 30000); // Every 30 seconds

// 2. Improve error handling in updateJobStatus
async updateJobStatus(jobId: string, status: SyncJobStatus, updates?: Partial<SyncJob>) {
  try {
    const result = await this.syncJobRepository.update({ id: jobId }, { 
      status, 
      lastHeartbeat: new Date(),
      ...updates 
    });
    
    if (result.affected === 0) {
      this.logger.error(`Failed to update job ${jobId} - not found`);
      throw new Error(`Job ${jobId} not found`);
    }
    
    this.logger.debug(`Job ${jobId} status updated to ${status}`);
  } catch (error) {
    this.logger.error(`Critical: Failed to update job ${jobId} status`, error);
    // Don't throw - let processing continue but log critical error
  }
}

// 3. Add zombie job detection endpoint
@Get('jobs/zombies')
async findZombieJobs() {
  return await this.syncService.findJobsWithoutHeartbeat();
}
```

#### **Testing Plan**
1. Create test job and verify status updates correctly
2. Simulate database connection failure during processing
3. Test zombie job detection endpoint  
4. Verify UI reflects real job status

#### **Acceptance Criteria**
- [ ] Job status updates correctly during processing
- [ ] Failed database updates don't stop processing but log errors
- [ ] UI shows real progress for active jobs
- [ ] Zombie jobs can be detected and handled
- [ ] No duplicate jobs created due to status confusion

#### **Effort Estimate**
- Investigation: 2 hours
- Implementation: 4 hours  
- Testing: 2 hours
- **Total: 8 hours**

---

## 🔧 ENHANCEMENTS

### #002 - Optimize Bulk Sync Performance  
**Priority:** P2 (Enhancement)  
**Status:** Planning  

#### **Current State**
- Processing 202,910 products takes 3+ hours
- Jobs timeout after 30 minutes of no progress
- BatchSize: 100 records per batch
- BatchDelay: 1000ms between batches

#### **Proposed Optimizations**
```json
{
  "batchSize": 50,
  "batchDelay": 2000, 
  "timeout": 7200000,
  "maxConcurrentJobs": 1,
  "retryFailedBatches": true,
  "enableProgressLogging": true
}
```

#### **Expected Results**  
- Reduce timeout failures
- Better resource management
- More reliable completion
- Estimated time: 2-4 hours for full sync

### #003 - Real-time Progress Dashboard
**Priority:** P3 (Nice to have)  
**Status:** Backlog  

Add WebSocket connection for real-time job progress updates without polling API.

### #004 - Incremental Sync Automation
**Priority:** P2 (Enhancement)  
**Status:** Backlog  

Automatically trigger incremental syncs after initial full sync completes.

---

## 📋 COMPLETED ISSUES

*None yet*

---

## 📝 NOTES

- All critical issues should be addressed before production deployment
- Performance issues can be addressed post-MVP
- UI enhancements are lowest priority

**Last Updated:** 2025-11-10 by GitHub Copilot
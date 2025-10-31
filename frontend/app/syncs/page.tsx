'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSyncJobs, useCancelJob } from '@/hooks/use-sync';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Activity, XCircle, Loader2, CheckCircle2, AlertCircle, Clock, Database } from 'lucide-react';
import { formatDate, formatDuration, formatNumber } from '@/lib/utils';

export default function SyncsPage() {
  const { data: syncJobs, isLoading } = useSyncJobs();
  const cancelJob = useCancelJob();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const handleCancel = async (id: string) => {
    if (!confirm('¿Estás seguro de cancelar esta sincronización?')) return;

    setCancellingId(id);
    try {
      await cancelJob.mutateAsync(id);
    } catch (error: any) {
      alert(`Error al cancelar: ${error.response?.data?.message || error.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'running':
      case 'pending':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-gray-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      completed: 'bg-green-100 text-green-700',
      running: 'bg-blue-100 text-blue-700',
      pending: 'bg-yellow-100 text-yellow-700',
      failed: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-700',
    };
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-700';
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      full: 'Sync Completa',
      incremental: 'Sync Incremental',
      webhook: 'Webhook',
    };
    return labels[type as keyof typeof labels] || type;
  };

  const calculateProgress = (job: any) => {
    if (job.status === 'completed') return 100;
    if (job.status === 'failed' || job.status === 'cancelled') return 0;
    if (!job.totalRecords || job.totalRecords === 0) return 0;
    return Math.round((job.processedRecords / job.totalRecords) * 100);
  };

  const filteredJobs = syncJobs?.filter((job: any) => {
    if (filterStatus === 'all') return true;
    return job.status === filterStatus;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando sincronizaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Sincronizaciones</h2>
            <p className="text-muted-foreground">
              Monitorea el estado de tus sincronizaciones
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex space-x-2">
          {[
            { value: 'all', label: 'Todas' },
            { value: 'running', label: 'En Progreso' },
            { value: 'completed', label: 'Completadas' },
            { value: 'failed', label: 'Fallidas' },
          ].map((filter) => (
            <Button
              key={filter.value}
              variant={filterStatus === filter.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{syncJobs?.length || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">En Progreso</CardTitle>
              <Loader2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {syncJobs?.filter((j: any) => j.status === 'running' || j.status === 'pending').length || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completadas</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {syncJobs?.filter((j: any) => j.status === 'completed').length || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fallidas</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {syncJobs?.filter((j: any) => j.status === 'failed').length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sync Jobs List */}
        {filteredJobs && filteredJobs.length > 0 ? (
          <div className="space-y-4">
            {filteredJobs.map((job: any) => {
              const progress = calculateProgress(job);
              const duration = job.completedAt
                ? new Date(job.completedAt).getTime() - new Date(job.startedAt || job.createdAt).getTime()
                : Date.now() - new Date(job.startedAt || job.createdAt).getTime();

              return (
                <Card key={job.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        {getStatusIcon(job.status)}
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg">{getTypeLabel(job.type)}</CardTitle>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(
                                job.status
                              )}`}
                            >
                              {job.status}
                            </span>
                          </div>
                          <CardDescription className="mt-1">
                            {job.datasource?.name} • {formatDate(job.createdAt)}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/syncs/${job.id}`}>
                          <Button variant="outline" size="sm">
                            Ver Detalles
                          </Button>
                        </Link>
                        {(job.status === 'running' || job.status === 'pending') && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleCancel(job.id)}
                            disabled={cancellingId === job.id}
                          >
                            {cancellingId === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Progress Bar */}
                    {(job.status === 'running' || job.status === 'pending') && job.totalRecords > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span>Progreso: {progress}%</span>
                          <span>
                            {formatNumber(job.processedRecords)} / {formatNumber(job.totalRecords)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Procesados</div>
                        <div className="font-medium">{formatNumber(job.processedRecords || 0)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Exitosos</div>
                        <div className="font-medium text-green-600">
                          {formatNumber(job.successfulRecords || 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Errores</div>
                        <div className="font-medium text-red-600">{job.failedRecords || 0}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Duración</div>
                        <div className="font-medium">{formatDuration(duration)}</div>
                      </div>
                    </div>

                    {/* Error Message */}
                    {job.status === 'failed' && job.errorMessage && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                        <div className="flex items-start">
                          <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
                          <div className="text-sm text-red-900">
                            <div className="font-medium">Error:</div>
                            <div className="mt-1">{job.errorMessage}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <Activity className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <CardTitle className="text-xl mb-2">No hay sincronizaciones</CardTitle>
              <CardDescription>
                {filterStatus === 'all'
                  ? 'Inicia una sincronización desde la página de Datasources'
                  : `No hay sincronizaciones con estado "${filterStatus}"`}
              </CardDescription>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

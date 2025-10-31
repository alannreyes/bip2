'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDatasource, useUpdateDatasource } from '@/hooks/use-datasources';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ArrowLeft,
  Save,
  Loader2,
  Database,
  Sparkles,
  Eye,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';

export default function EditDatasourcePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: datasource, isLoading } = useDatasource(id);
  const updateMutation = useUpdateDatasource();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    syncSchedule: '',
    webhookEnabled: false,
    status: 'active' as 'active' | 'paused' | 'error',
    queryTemplate: '',
  });

  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (datasource) {
      setFormData({
        name: datasource.name || '',
        description: datasource.description || '',
        syncSchedule: datasource.syncSchedule || '',
        webhookEnabled: datasource.webhookEnabled || false,
        status: datasource.status || 'active',
        queryTemplate: datasource.queryTemplate || '',
      });
    }
  }, [datasource]);

  const handleValidateWithAI = async () => {
    setIsValidating(true);
    setAiSuggestion(null);
    try {
      const response = await api.post(`/datasources/${id}/validate-query-ai`, {
        query: formData.queryTemplate,
      });
      setAiSuggestion(response.data.queryValidation);
    } catch (error: any) {
      console.error('AI validation error:', error);
      alert('Error al validar con IA: ' + (error.response?.data?.message || error.message));
    } finally {
      setIsValidating(false);
    }
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    setPreviewData(null);
    setAiSuggestion(null);
    try {
      const response = await api.get(`/datasources/${id}/preview?limit=3`);
      setPreviewData(response.data);
    } catch (error: any) {
      // If preview fails, try analyzing the error with AI
      const errorMessage = error.response?.data?.message || error.message;
      try {
        const aiResponse = await api.post(`/datasources/${id}/analyze-error`, {
          errorMessage: errorMessage.replace('Failed to preview data: ', ''),
          errorType: 'sql',
        });
        setAiSuggestion(aiResponse.data.suggestion);
      } catch (aiError) {
        console.error('AI analysis error:', aiError);
      }
      alert('Error en preview: ' + errorMessage);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApplyAICorrection = () => {
    if (aiSuggestion?.correctedCode) {
      setFormData({ ...formData, queryTemplate: aiSuggestion.correctedCode });
      setAiSuggestion(null);
    } else if (aiSuggestion?.correctedQuery) {
      setFormData({ ...formData, queryTemplate: aiSuggestion.correctedQuery });
      setAiSuggestion(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateMutation.mutateAsync({
        id,
        data: formData,
      });
      router.push('/datasources');
    } catch (error: any) {
      alert(`Error al actualizar: ${error.response?.data?.message || error.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!datasource) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-xl font-medium mb-4">Datasource no encontrado</p>
          <Button onClick={() => router.push('/datasources')}>Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="flex h-16 items-center px-8">
          <div className="flex items-center space-x-2">
            <Database className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Catálogo Semántico EFC</h1>
          </div>
          <nav className="ml-8 flex items-center space-x-6 text-sm font-medium">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/datasources" className="text-primary">
              Datasources
            </Link>
          </nav>
        </div>
      </div>

      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href="/datasources">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver a Datasources
              </Button>
            </Link>
            <h2 className="text-3xl font-bold tracking-tight">Editar Fuente de Datos</h2>
            <p className="text-muted-foreground">
              Actualiza la configuración de {datasource.name}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Información Básica</CardTitle>
                <CardDescription>
                  Información general de la fuente de datos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nombre</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Descripción</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Estado</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as any })
                    }
                  >
                    <option value="active">Activo</option>
                    <option value="paused">Pausado</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Las fuentes pausadas no ejecutarán sincronizaciones programadas
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Query SQL</CardTitle>
                    <CardDescription>
                      Edita la consulta SQL con asistencia de IA
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleValidateWithAI}
                      disabled={isValidating || !formData.queryTemplate}
                    >
                      {isValidating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Validar con IA
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handlePreview}
                      disabled={isPreviewing || !formData.queryTemplate}
                    >
                      {isPreviewing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="mr-2 h-4 w-4" />
                      )}
                      Preview
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                    rows={15}
                    value={formData.queryTemplate}
                    onChange={(e) => setFormData({ ...formData, queryTemplate: e.target.value })}
                    placeholder="SELECT * FROM tabla WHERE campo = {{parametro}}"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Usa {'{{offset}}'} y {'{{limit}}'} para paginación automática
                  </p>
                </div>

                {/* AI Suggestion Alert */}
                {aiSuggestion && (
                  <Alert className={aiSuggestion.isValid === false || aiSuggestion.correctedCode ? "border-yellow-500 bg-yellow-50" : "border-green-500 bg-green-50"}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {aiSuggestion.isValid === false || aiSuggestion.correctedCode ? (
                          <AlertCircle className="h-4 w-4 text-yellow-600" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                        <AlertTitle className="ml-6 -mt-5">
                          {aiSuggestion.isValid === false ? "Problemas detectados" : aiSuggestion.correctedCode ? "Corrección sugerida" : "Query válida"}
                        </AlertTitle>
                        <AlertDescription className="ml-6 mt-2 space-y-2">
                          {aiSuggestion.explanation && (
                            <p className="text-sm">{aiSuggestion.explanation}</p>
                          )}
                          {aiSuggestion.suggestedFix && (
                            <div className="mt-2">
                              <p className="font-medium text-sm">Solución sugerida:</p>
                              <p className="text-sm">{aiSuggestion.suggestedFix}</p>
                            </div>
                          )}
                          {aiSuggestion.confidence && (
                            <p className="text-xs">
                              Confianza: <span className="font-medium capitalize">{aiSuggestion.confidence}</span>
                            </p>
                          )}
                        </AlertDescription>
                      </div>
                      {(aiSuggestion.correctedCode || aiSuggestion.correctedQuery) && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleApplyAICorrection}
                          className="ml-4"
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Aplicar Corrección
                        </Button>
                      )}
                    </div>
                  </Alert>
                )}

                {/* Preview Data */}
                {previewData && (
                  <Alert className="border-blue-500 bg-blue-50">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="ml-6 -mt-5">Preview Exitoso</AlertTitle>
                    <AlertDescription className="ml-6 mt-2">
                      <p className="text-sm mb-2">
                        Se encontraron {previewData.total} registros. Mostrando los primeros {previewData.rows?.length || 0}:
                      </p>
                      {previewData.rows && previewData.rows.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="border-b">
                                {previewData.columns?.map((col: string, i: number) => (
                                  <th key={i} className="px-2 py-1 text-left font-medium">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.rows.slice(0, 3).map((row: any, i: number) => (
                                <tr key={i} className="border-b">
                                  {previewData.columns?.map((col: string, j: number) => (
                                    <td key={j} className="px-2 py-1">
                                      {String(row[col] || '').substring(0, 50)}
                                      {String(row[col] || '').length > 50 ? '...' : ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Configuración de Sincronización</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Programación (Cron Expression)
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                    value={formData.syncSchedule}
                    onChange={(e) => setFormData({ ...formData, syncSchedule: e.target.value })}
                    placeholder="0 2 * * *"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Ejemplos: "0 2 * * *" (diario 2am), "0 */6 * * *" (cada 6 horas), vacío para desactivar
                  </p>
                </div>

                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.webhookEnabled}
                      onChange={(e) =>
                        setFormData({ ...formData, webhookEnabled: e.target.checked })
                      }
                      className="rounded"
                    />
                    <span className="text-sm font-medium">Habilitar Webhook</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    Permite sincronizaciones en tiempo real mediante webhook
                  </p>
                  {datasource.webhookSecret && formData.webhookEnabled && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-md">
                      <div className="text-xs font-medium mb-1">Webhook Secret:</div>
                      <code className="text-xs font-mono bg-white px-2 py-1 rounded border">
                        {datasource.webhookSecret}
                      </code>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6 bg-gray-50">
              <CardHeader>
                <CardTitle className="text-sm">Información de Solo Lectura</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-muted-foreground">Tipo</div>
                    <div className="font-medium">{datasource.type.toUpperCase()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Colección Qdrant</div>
                    <div className="font-medium">{datasource.qdrantCollection}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Host</div>
                    <div className="font-medium">{datasource.connectionConfig?.host}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Base de Datos</div>
                    <div className="font-medium">{datasource.connectionConfig?.database}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/datasources')}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

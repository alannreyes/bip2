'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateDatasource, useTestConnection } from '@/hooks/use-datasources';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, ChevronLeft, ChevronRight, Check, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

// Helper function to get API URL dynamically based on current hostname
function getApiBaseUrl(): string {
  // Prefer environment variable from Docker/build time
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Browser runtime detection (for direct server deployment)
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3001/api`;
  }
  
  // Fallback for server-side rendering
  return 'http://192.168.40.197:3001/api';
}

type DatasourceType = 'mssql' | 'mysql' | 'postgresql';

interface FormData {
  // Step 1
  name: string;
  type: DatasourceType;
  description: string;

  // Step 2
  connectionConfig: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };

  // Step 3
  queryTemplate: string;

  // Step 4
  embeddingFields: string[];
  fieldMapping: Record<string, string>;

  // Step 5
  qdrantCollection: string;
  syncSchedule: string;
  webhookEnabled: boolean;
}

export default function NewDatasourcePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [connectionValid, setConnectionValid] = useState(false);

  const createMutation = useCreateDatasource();
  const testConnection = useTestConnection();

  const [formData, setFormData] = useState<FormData>({
    name: '',
    type: 'mssql',
    description: '',
    connectionConfig: {
      host: '',
      port: 1433,
      database: '',
      user: '',
      password: '',
    },
    queryTemplate: '',
    embeddingFields: [],
    fieldMapping: {},
    qdrantCollection: '',
    syncSchedule: '',
    webhookEnabled: false,
  });

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      // Use the test-connection endpoint directly
      const response = await fetch(`${getApiBaseUrl()}/datasources/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: formData.type,
          connectionConfig: formData.connectionConfig,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al probar conexión');
      }

      setConnectionValid(true);
      alert('Conexión exitosa');
    } catch (error: any) {
      setConnectionValid(false);
      alert(`Error de conexión: ${error.message}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handlePreviewQuery = async () => {
    setIsPreviewing(true);
    let datasourceId: string | null = null;
    try {
      // Create temporary datasource for preview
      const testData = {
        name: formData.name + '_preview_' + Date.now(),
        type: formData.type,
        connectionConfig: formData.connectionConfig,
        queryTemplate: formData.queryTemplate,
        fieldMapping: { temp: 'temp' },
        idField: 'temp',
        embeddingFields: ['temp'],
        qdrantCollection: 'test',
      };

      const response = await createMutation.mutateAsync(testData);
      datasourceId = response.id;

      // Get preview
      const previewResponse = await fetch(
        `${getApiBaseUrl()}/datasources/${response.id}/preview?limit=5`
      );

      if (!previewResponse.ok) {
        const error = await previewResponse.json();
        throw new Error(error.message || 'Error al obtener vista previa');
      }

      const preview = await previewResponse.json();

      // Validate preview data structure
      if (!preview.columns || !preview.rows || !Array.isArray(preview.columns) || !Array.isArray(preview.rows)) {
        throw new Error('Datos de vista previa inválidos');
      }

      setPreviewData(preview);
    } catch (error: any) {
      alert(`Error al obtener vista previa: ${error.response?.data?.message || error.message}`);
      setPreviewData(null);
    } finally {
      // Delete the test datasource if it was created
      if (datasourceId) {
        try {
          await fetch(`${getApiBaseUrl()}/datasources/${datasourceId}`, {
            method: 'DELETE',
          });
        } catch (e) {
          console.error('Error deleting test datasource:', e);
        }
      }
      setIsPreviewing(false);
    }
  };

  const handleSubmit = async () => {
    try {
      // Get the first field from fieldMapping as idField
      const firstMappedField = Object.keys(formData.fieldMapping)[0];

      const submitData = {
        ...formData,
        idField: firstMappedField || 'id',
      };

      await createMutation.mutateAsync(submitData);
      router.push('/datasources');
    } catch (error: any) {
      alert(`Error al crear fuente de datos: ${error.response?.data?.message || error.message}`);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.name && formData.type && formData.description;
      case 2:
        return connectionValid && formData.connectionConfig.host && formData.connectionConfig.database;
      case 3:
        return formData.queryTemplate && previewData;
      case 4:
        return formData.embeddingFields.length > 0 && Object.keys(formData.fieldMapping).length > 0;
      case 5:
        return formData.qdrantCollection;
      default:
        return false;
    }
  };

  const steps = [
    { number: 1, title: 'Información Básica' },
    { number: 2, title: 'Conexión' },
    { number: 3, title: 'Consulta SQL' },
    { number: 4, title: 'Campos' },
    { number: 5, title: 'Configuración' },
  ];

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
            <h2 className="text-3xl font-bold tracking-tight">Nueva Fuente de Datos</h2>
            <p className="text-muted-foreground">
              Configura una nueva fuente de datos en 5 pasos
            </p>
          </div>

          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.number} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                        step.number < currentStep
                          ? 'bg-primary border-primary text-primary-foreground'
                          : step.number === currentStep
                          ? 'border-primary text-primary'
                          : 'border-gray-300 text-gray-400'
                      }`}
                    >
                      {step.number < currentStep ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        step.number
                      )}
                    </div>
                    <span className="mt-2 text-xs font-medium">{step.title}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`h-0.5 w-24 mx-4 ${
                        step.number < currentStep ? 'bg-primary' : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Paso {currentStep}: {steps[currentStep - 1].title}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Step 1: Basic Info */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Nombre</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.name}
                      onChange={(e) => updateFormData({ name: e.target.value })}
                      placeholder="Ej: Catálogo Principal"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Tipo de Base de Datos</label>
                    <select
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.type}
                      onChange={(e) => {
                        const type = e.target.value as DatasourceType;
                        const defaultPorts = { mssql: 1433, mysql: 3306, postgresql: 5432 };
                        updateFormData({
                          type,
                          connectionConfig: {
                            ...formData.connectionConfig,
                            port: defaultPorts[type],
                          },
                        });
                      }}
                    >
                      <option value="mssql">MS SQL Server</option>
                      <option value="mysql">MySQL</option>
                      <option value="postgresql">PostgreSQL</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Descripción</label>
                    <textarea
                      className="w-full px-3 py-2 border rounded-md"
                      rows={3}
                      value={formData.description}
                      onChange={(e) => updateFormData({ description: e.target.value })}
                      placeholder="Describe esta fuente de datos..."
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Connection */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Host</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded-md"
                        value={formData.connectionConfig.host}
                        onChange={(e) =>
                          updateFormData({
                            connectionConfig: { ...formData.connectionConfig, host: e.target.value },
                          })
                        }
                        placeholder="Ej: 192.168.1.100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Puerto</label>
                      <input
                        type="number"
                        className="w-full px-3 py-2 border rounded-md"
                        value={formData.connectionConfig.port}
                        onChange={(e) =>
                          updateFormData({
                            connectionConfig: {
                              ...formData.connectionConfig,
                              port: parseInt(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Base de Datos</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.connectionConfig.database}
                      onChange={(e) =>
                        updateFormData({
                          connectionConfig: { ...formData.connectionConfig, database: e.target.value },
                        })
                      }
                      placeholder="Ej: catalog_db"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Usuario</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.connectionConfig.user}
                      onChange={(e) =>
                        updateFormData({
                          connectionConfig: { ...formData.connectionConfig, user: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Contraseña</label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.connectionConfig.password}
                      onChange={(e) =>
                        updateFormData({
                          connectionConfig: { ...formData.connectionConfig, password: e.target.value },
                        })
                      }
                    />
                  </div>

                  <Button
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                    className="w-full"
                  >
                    {isTestingConnection ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Probando conexión...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Probar Conexión
                      </>
                    )}
                  </Button>

                  {connectionValid && (
                    <div className="flex items-center text-sm text-green-600 bg-green-50 p-3 rounded-md">
                      <Check className="h-4 w-4 mr-2" />
                      Conexión exitosa
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Query */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Consulta SQL</label>
                    <div className="mb-2 text-sm text-muted-foreground">
                      Usa <code className="bg-gray-100 px-1 rounded">{'{{offset}}'}</code> y{' '}
                      <code className="bg-gray-100 px-1 rounded">{'{{limit}}'}</code> para paginación
                    </div>
                    <textarea
                      className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                      rows={8}
                      value={formData.queryTemplate}
                      onChange={(e) => updateFormData({ queryTemplate: e.target.value })}
                      placeholder={`SELECT
  codigo,
  nombre,
  descripcion,
  precio,
  categoria,
  imagen_url
FROM productos
WHERE activo = 1
ORDER BY codigo
OFFSET {{offset}} ROWS
FETCH NEXT {{limit}} ROWS ONLY`}
                    />
                  </div>

                  <Button
                    onClick={handlePreviewQuery}
                    disabled={isPreviewing || !formData.queryTemplate}
                    className="w-full"
                  >
                    {isPreviewing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Obteniendo vista previa...
                      </>
                    ) : (
                      'Ver Vista Previa (5 registros)'
                    )}
                  </Button>

                  {previewData && (
                    <div className="border rounded-md p-4 bg-gray-50">
                      <div className="text-sm font-medium mb-2">
                        Total de registros: {previewData.total}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              {previewData.columns.map((col: string) => (
                                <th key={col} className="text-left p-2 font-medium">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.rows.slice(0, 5).map((row: any, idx: number) => (
                              <tr key={idx} className="border-b">
                                {previewData.columns.map((col: string) => (
                                  <td key={col} className="p-2">
                                    {String(row[col] || '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Fields */}
              {currentStep === 4 && previewData && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Campos para Embeddings</label>
                    <div className="text-sm text-muted-foreground mb-3">
                      Selecciona los campos que se usarán para generar los embeddings
                    </div>
                    <div className="space-y-2 border rounded-md p-4 bg-gray-50">
                      {previewData.columns.map((col: string) => (
                        <label key={col} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={formData.embeddingFields.includes(col)}
                            onChange={(e) => {
                              const fields = e.target.checked
                                ? [...formData.embeddingFields, col]
                                : formData.embeddingFields.filter((f) => f !== col);
                              updateFormData({ embeddingFields: fields });
                            }}
                            className="rounded"
                          />
                          <span>{col}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium">Mapeo de Campos</label>
                      <button
                        type="button"
                        onClick={() => {
                          const newMapping: Record<string, string> = {};
                          previewData.columns.forEach((col: string) => {
                            newMapping[col] = col;
                          });
                          updateFormData({ fieldMapping: newMapping });
                        }}
                        className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 transition-colors"
                      >
                        ↻ Usar los mismos campos
                      </button>
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      Define cómo se almacenarán los campos en Qdrant
                    </div>
                    <div className="space-y-3">
                      {previewData.columns.map((col: string) => (
                        <div key={col} className="grid grid-cols-2 gap-4">
                          <div className="flex items-center">
                            <span className="text-sm font-mono">{col}</span>
                          </div>
                          <input
                            type="text"
                            className="px-3 py-2 border rounded-md text-sm"
                            placeholder="Nombre en Qdrant"
                            value={formData.fieldMapping[col] || ''}
                            onChange={(e) =>
                              updateFormData({
                                fieldMapping: {
                                  ...formData.fieldMapping,
                                  [col]: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Configuration */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Nombre de Colección en Qdrant</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.qdrantCollection}
                      onChange={(e) => updateFormData({ qdrantCollection: e.target.value })}
                      placeholder="Ej: catalogo_principal"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Usa solo letras minúsculas, números y guiones bajos
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Programación de Sincronización (Opcional)
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-md"
                      value={formData.syncSchedule}
                      onChange={(e) => updateFormData({ syncSchedule: e.target.value })}
                      placeholder="Ej: 0 2 * * * (cron expression)"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Formato cron. Ejemplo: "0 2 * * *" = todos los días a las 2am
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.webhookEnabled}
                        onChange={(e) => updateFormData({ webhookEnabled: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Habilitar Webhook</span>
                    </label>
                    <div className="text-xs text-muted-foreground mt-1 ml-6">
                      Permite sincronizaciones en tiempo real mediante webhook
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
                      <div className="text-sm text-blue-900">
                        <div className="font-medium mb-1">Resumen de Configuración</div>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Tipo: {formData.type.toUpperCase()}</li>
                          <li>Base de datos: {formData.connectionConfig.database}</li>
                          <li>Campos embedding: {formData.embeddingFields.length}</li>
                          <li>Colección Qdrant: {formData.qdrantCollection || '(sin definir)'}</li>
                          <li>Webhook: {formData.webhookEnabled ? 'Habilitado' : 'Deshabilitado'}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-8 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={currentStep === 1}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Atrás
                </Button>

                {currentStep < 5 ? (
                  <Button
                    onClick={handleNext}
                    disabled={!canProceed()}
                  >
                    Siguiente
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={!canProceed() || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Crear Fuente de Datos
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

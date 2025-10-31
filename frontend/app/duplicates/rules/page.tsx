'use client';

import { useState, useEffect } from 'react';
import { useCollections } from '@/hooks/use-collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import {
  Settings,
  Save,
  RefreshCw,
  Upload,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  TestTube,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';
import { duplicatesApi } from '@/lib/api';

interface DuplicateRules {
  version: string;
  collectionName: string;
  colorWords: {
    enabled: boolean;
    words: string[];
  };
  variantTypeWords: {
    enabled: boolean;
    words: string[];
  };
  patterns: any;
  customPatterns?: any[];
  strategy: {
    useManufacturerCode: boolean;
    useDescriptionNormalization: boolean;
    minNormalizedLength: number;
  };
}

export default function DuplicateRulesPage() {
  const { data: collections, isLoading: collectionsLoading } = useCollections();
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [rules, setRules] = useState<DuplicateRules | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test state
  const [productId1, setProductId1] = useState('');
  const [productId2, setProductId2] = useState('');
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    colorWords: true,
    variantTypes: true,
    strategy: true,
    test: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Load rules when collection changes
  useEffect(() => {
    if (selectedCollection) {
      loadRules();
    }
  }, [selectedCollection]);

  const loadRules = async () => {
    if (!selectedCollection) return;

    setIsLoading(true);
    try {
      const response = await duplicatesApi.getRules(selectedCollection);
      setRules(response.data);
    } catch (error: any) {
      console.error('Error loading rules:', error);
      alert(`Error al cargar reglas: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCollection || !rules) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      await duplicatesApi.updateRules(selectedCollection, rules);
      setSaveMessage({ type: 'success', text: 'Reglas guardadas exitosamente' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error: any) {
      console.error('Error saving rules:', error);
      setSaveMessage({
        type: 'error',
        text: `Error al guardar: ${error.response?.data?.message || error.message}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedCollection) return;
    if (!confirm('¿Estás seguro de que deseas resetear las reglas a los valores por defecto?')) return;

    setIsLoading(true);
    try {
      await duplicatesApi.deleteRules(selectedCollection);
      await loadRules();
      setSaveMessage({ type: 'success', text: 'Reglas reseteadas a valores por defecto' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error: any) {
      console.error('Error resetting rules:', error);
      alert(`Error al resetear: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (!selectedCollection) return;

    try {
      const response = await duplicatesApi.exportRules(selectedCollection);
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `duplicate-rules-${selectedCollection}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error exporting rules:', error);
      alert(`Error al exportar: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importedRules = JSON.parse(text);
        await duplicatesApi.importRules(selectedCollection, importedRules);
        await loadRules();
        setSaveMessage({ type: 'success', text: 'Reglas importadas exitosamente' });
        setTimeout(() => setSaveMessage(null), 3000);
      } catch (error: any) {
        console.error('Error importing rules:', error);
        alert(`Error al importar: ${error.response?.data?.message || error.message}`);
      }
    };
    input.click();
  };

  const handleTestRules = async () => {
    if (!selectedCollection || !productId1 || !productId2) {
      alert('Por favor completa todos los campos de prueba');
      return;
    }

    setIsTestRunning(true);
    setTestResult(null);

    try {
      const response = await duplicatesApi.testRules({
        collection: selectedCollection,
        productId1,
        productId2,
        rules: rules,
      });
      setTestResult(response.data);
    } catch (error: any) {
      console.error('Error testing rules:', error);
      alert(`Error al probar reglas: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsTestRunning(false);
    }
  };

  const updateColorWords = (words: string[]) => {
    if (!rules) return;
    setRules({ ...rules, colorWords: { ...rules.colorWords, words } });
  };

  const updateVariantTypeWords = (words: string[]) => {
    if (!rules) return;
    setRules({ ...rules, variantTypeWords: { ...rules.variantTypeWords, words } });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Settings className="h-8 w-8" />
              Configuración de Reglas de Detección
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Personaliza las reglas para identificar variantes y duplicados en cada colección
            </p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Seleccionar Colección</CardTitle>
              <CardDescription>Cada colección puede tener sus propias reglas personalizadas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {collectionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Cargando colecciones...</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <select
                        className="w-full px-3 py-2 border rounded-md bg-white"
                        value={selectedCollection}
                        onChange={(e) => setSelectedCollection(e.target.value)}
                      >
                        <option value="">-- Selecciona una colección --</option>
                        {collections?.map((collection: any) => (
                          <option key={collection.id} value={collection.name}>
                            {collection.name} ({collection.totalPoints?.toLocaleString() || 0} productos)
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedCollection && (
                      <>
                        <Button onClick={handleExport} variant="outline" size="default">
                          <Download className="mr-2 h-4 w-4" />
                          Exportar
                        </Button>
                        <Button onClick={handleImport} variant="outline" size="default">
                          <Upload className="mr-2 h-4 w-4" />
                          Importar
                        </Button>
                        <Button onClick={handleReset} variant="outline" size="default">
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Resetear
                        </Button>
                      </>
                    )}
                  </div>

                  {saveMessage && (
                    <div
                      className={`p-3 rounded-md flex items-center gap-2 ${
                        saveMessage.type === 'success'
                          ? 'bg-green-50 text-green-800 border border-green-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {saveMessage.type === 'success' ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <XCircle className="h-5 w-5" />
                      )}
                      {saveMessage.text}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {isLoading && (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </CardContent>
            </Card>
          )}

          {!isLoading && rules && (
            <div className="space-y-4">
              <Card>
                <CardHeader
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleSection('colorWords')}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {expandedSections.colorWords ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        Palabras de Colores
                        <span className={`text-sm ${rules.colorWords.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                          ({rules.colorWords.enabled ? 'Activo' : 'Inactivo'})
                        </span>
                      </CardTitle>
                      <CardDescription>Palabras que serán removidas al normalizar descripciones</CardDescription>
                    </div>
                    <label className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={rules.colorWords.enabled}
                        onChange={(e) =>
                          setRules({ ...rules, colorWords: { ...rules.colorWords, enabled: e.target.checked } })
                        }
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Habilitar</span>
                    </label>
                  </div>
                </CardHeader>
                {expandedSections.colorWords && (
                  <CardContent>
                    <textarea
                      className="w-full h-32 px-3 py-2 border rounded-md font-mono text-sm"
                      value={rules.colorWords.words.join(', ')}
                      onChange={(e) =>
                        updateColorWords(
                          e.target.value.split(',').map((w) => w.trim()).filter((w) => w)
                        )
                      }
                      placeholder="negro, blanco, rojo, azul, verde..."
                      disabled={!rules.colorWords.enabled}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Separa las palabras con comas. Estas palabras serán removidas para identificar variantes de color.
                    </p>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleSection('variantTypes')}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {expandedSections.variantTypes ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        Palabras de Tipos de Variante
                        <span className={`text-sm ${rules.variantTypeWords.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                          ({rules.variantTypeWords.enabled ? 'Activo' : 'Inactivo'})
                        </span>
                      </CardTitle>
                      <CardDescription>Palabras que indican variantes (macho/hembra, fijo/giratorio, etc.)</CardDescription>
                    </div>
                    <label className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={rules.variantTypeWords.enabled}
                        onChange={(e) =>
                          setRules({ ...rules, variantTypeWords: { ...rules.variantTypeWords, enabled: e.target.checked } })
                        }
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Habilitar</span>
                    </label>
                  </div>
                </CardHeader>
                {expandedSections.variantTypes && (
                  <CardContent>
                    <textarea
                      className="w-full h-32 px-3 py-2 border rounded-md font-mono text-sm"
                      value={rules.variantTypeWords.words.join(', ')}
                      onChange={(e) =>
                        updateVariantTypeWords(
                          e.target.value.split(',').map((w) => w.trim()).filter((w) => w)
                        )
                      }
                      placeholder="macho, hembra, fijo, giratorio..."
                      disabled={!rules.variantTypeWords.enabled}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Separa las palabras con comas. Estas palabras serán removidas para identificar variantes de tipo.
                    </p>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleSection('strategy')}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {expandedSections.strategy ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      Estrategia de Detección
                    </CardTitle>
                  </div>
                </CardHeader>
                {expandedSections.strategy && (
                  <CardContent className="space-y-4">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={rules.strategy.useManufacturerCode}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            strategy: { ...rules.strategy, useManufacturerCode: e.target.checked },
                          })
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <div className="font-medium">Usar Código de Fabricante</div>
                        <div className="text-xs text-muted-foreground">
                          Productos con mismo fabricante pero diferente número de parte son considerados variantes
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={rules.strategy.useDescriptionNormalization}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            strategy: { ...rules.strategy, useDescriptionNormalization: e.target.checked },
                          })
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <div className="font-medium">Usar Normalización de Descripciones</div>
                        <div className="text-xs text-muted-foreground">
                          Aplicar todas las reglas de normalización para detectar variantes
                        </div>
                      </div>
                    </label>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Longitud Mínima Normalizada: {rules.strategy.minNormalizedLength}
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="30"
                        value={rules.strategy.minNormalizedLength}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            strategy: { ...rules.strategy, minNormalizedLength: parseInt(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Descripciones normalizadas más cortas que esto no serán consideradas variantes
                      </p>
                    </div>
                  </CardContent>
                )}
              </Card>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-6">
                  <Button onClick={handleSave} disabled={isSaving} size="lg" className="w-full">
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-5 w-5" />
                        Guardar Cambios
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mt-3">
                    Los cambios se aplicarán inmediatamente en la detección de duplicados
                  </p>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader
                  className="cursor-pointer hover:bg-blue-100/30"
                  onClick={() => toggleSection('test')}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {expandedSections.test ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        <TestTube className="h-5 w-5" />
                        Probar Reglas
                      </CardTitle>
                      <CardDescription>Prueba cómo se normalizan dos productos con las reglas actuales</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {expandedSections.test && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">ID del Producto 1</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border rounded-md"
                          value={productId1}
                          onChange={(e) => setProductId1(e.target.value)}
                          placeholder="A0010812"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">ID del Producto 2</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border rounded-md"
                          value={productId2}
                          onChange={(e) => setProductId2(e.target.value)}
                          placeholder="A0014188"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={handleTestRules}
                      disabled={isTestRunning || !productId1 || !productId2}
                      className="w-full"
                      variant="default"
                    >
                      {isTestRunning ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Probando...
                        </>
                      ) : (
                        <>
                          <TestTube className="mr-2 h-5 w-5" />
                          Probar Reglas
                        </>
                      )}
                    </Button>

                    {testResult && (
                      <div className="mt-6 space-y-4">
                        <div className={`p-4 rounded-lg border-2 ${testResult.areVariants ? 'bg-green-50 border-green-300' : 'bg-orange-50 border-orange-300'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            {testResult.areVariants ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : (
                              <Info className="h-5 w-5 text-orange-600" />
                            )}
                            <span className="font-semibold">
                              {testResult.areVariants ? 'Son Variantes' : 'NO son Variantes'}
                            </span>
                          </div>
                          <p className="text-sm">{testResult.reason}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="border rounded-lg p-4 bg-white">
                            <h4 className="font-semibold mb-2 text-sm">Producto 1: {testResult.product1.id}</h4>
                            <div className="space-y-2">
                              <div>
                                <div className="text-xs text-muted-foreground">Original:</div>
                                <div className="text-xs font-mono bg-gray-50 p-2 rounded">
                                  {testResult.product1.description}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Normalizado:</div>
                                <div className="text-xs font-mono bg-green-50 p-2 rounded font-semibold">
                                  {testResult.product1.normalized}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Pasos:</div>
                                <div className="text-xs space-y-1">
                                  {testResult.product1.steps.map((step: any, idx: number) => (
                                    <div key={idx} className="bg-gray-50 p-2 rounded">
                                      <div className="font-semibold">{step.step}</div>
                                      <div className="font-mono text-xs text-gray-600">{step.result}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="border rounded-lg p-4 bg-white">
                            <h4 className="font-semibold mb-2 text-sm">Producto 2: {testResult.product2.id}</h4>
                            <div className="space-y-2">
                              <div>
                                <div className="text-xs text-muted-foreground">Original:</div>
                                <div className="text-xs font-mono bg-gray-50 p-2 rounded">
                                  {testResult.product2.description}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Normalizado:</div>
                                <div className="text-xs font-mono bg-green-50 p-2 rounded font-semibold">
                                  {testResult.product2.normalized}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Pasos:</div>
                                <div className="text-xs space-y-1">
                                  {testResult.product2.steps.map((step: any, idx: number) => (
                                    <div key={idx} className="bg-gray-50 p-2 rounded">
                                      <div className="font-semibold">{step.step}</div>
                                      <div className="font-mono text-xs text-gray-600">{step.result}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            </div>
          )}

          {!isLoading && !rules && selectedCollection && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings className="h-16 w-16 text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground text-center">
                  No se pudieron cargar las reglas para esta colección
                </p>
              </CardContent>
            </Card>
          )}

          {!isLoading && !selectedCollection && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings className="h-16 w-16 text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground text-center">
                  Selecciona una colección para comenzar a editar sus reglas
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

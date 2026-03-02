import { useState } from 'react'
import { useLogs } from './use-logs'
import { useRules } from './use-rules'
import { useMocks } from './use-mocks'
import { usePlugins } from './use-plugins'

/**
 * Composed store hook that combines all domain-specific hooks
 * This provides a single interface for components to access all proxy functionality
 */
export function useProxyStore() {
  // Max records configuration
  const [maxRecords, setMaxRecords] = useState(1000)

  // Compose domain-specific hooks
  const logs = useLogs(maxRecords)
  const rules = useRules()
  const mocks = useMocks()
  const plugins = usePlugins()

  // Return combined interface
  return {
    // Logs
    records: logs.records,
    selectedRecordId: logs.selectedRecordId,
    recordDetail: logs.recordDetail,
    detailLoading: logs.detailLoading,
    fetchDetail: logs.fetchDetail,
    closeDetail: logs.closeDetail,
    clearRecords: logs.clearRecords,
    replayRequest: logs.replayRequest,
    maxRecords,
    setMaxRecords,

    // Rules
    rules: rules.rules,
    setRules: rules.setRules,
    fetchRules: rules.fetchRules,
    saveRules: rules.saveRules,
    loadRulesFromFile: rules.loadRulesFromFile,
    ruleSets: rules.ruleSets,
    fetchRuleSets: rules.fetchRuleSets,
    saveRuleSet: rules.saveRuleSet,
    switchRuleSet: rules.switchRuleSet,
    deleteRuleSet: rules.deleteRuleSet,

    // Mocks
    mockRules: mocks.mockRules,
    fetchMocks: mocks.fetchMocks,
    createMock: mocks.createMock,
    updateMock: mocks.updateMock,
    deleteMock: mocks.deleteMock,

    // Plugins
    plugins: plugins.plugins,
    pluginMode: plugins.pluginMode,
    thirdPartyPlugins: plugins.thirdPartyPlugins,
    thirdPartySecurity: plugins.thirdPartySecurity,
    fetchPlugins: plugins.fetchPlugins,
    startPlugin: plugins.startPlugin,
    stopPlugin: plugins.stopPlugin,
    fetchThirdPartyPlugins: plugins.fetchThirdPartyPlugins,
    loadThirdPartyPlugin: plugins.loadThirdPartyPlugin,
    unloadThirdPartyPlugin: plugins.unloadThirdPartyPlugin,
  }
}


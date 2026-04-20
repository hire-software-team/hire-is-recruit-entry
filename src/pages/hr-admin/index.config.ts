export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: 'HR管理' })
  : { navigationBarTitleText: 'HR管理' }

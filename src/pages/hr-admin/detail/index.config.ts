export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '员工详情' })
  : { navigationBarTitleText: '员工详情' }

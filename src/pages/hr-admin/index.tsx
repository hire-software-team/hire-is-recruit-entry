import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Shield, KeyRound, Users, LogIn, User, Phone, Calendar, Trash2, Lock, Eye } from 'lucide-react-taro'

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  submitted: { label: '待复核', className: 'bg-yellow-100 text-yellow-800' },
  locked: { label: '已锁定', className: 'bg-red-100 text-red-800' },
  verified: { label: '已通过', className: 'bg-green-100 text-green-800' },
}

interface Employee {
  id: number
  name: string
  phone: string
  status: string
  lock_source?: string
  locked_by?: number
  locked_at?: string
  viewing_count?: number
  hr_contact?: string
  join_date?: string
  created_at: string
}

export default function HrAdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [adminRole, setAdminRole] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [adminList, setAdminList] = useState<any[]>([])
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [newAdminUsername, setNewAdminUsername] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [newAdminRole, setNewAdminRole] = useState('level3')
  const [newAdminHrContacts, setNewAdminHrContacts] = useState('魏经理')

  // 页面显示时检查登录状态和刷新数据
  useEffect(() => {
    const savedToken = Taro.getStorageSync('hr_token')
    const savedRole = Taro.getStorageSync('hr_role')
    const savedUsername = Taro.getStorageSync('hr_username')
    if (savedToken) {
      setToken(savedToken)
      setAdminRole(savedRole || 'level1')
      setUsername(savedUsername || '')
      setIsLoggedIn(true)
      fetchEmployees(savedToken)
    }
  }, [])

  // 从详情页返回时刷新列表
  Taro.useDidShow(() => {
    if (token) {
      fetchEmployees(token)
    }
  })

  const fetchEmployees = async (tk?: string) => {
    const t = tk || token
    if (!t) return
    try {
      const res = await Network.request({
        url: '/api/hr/employees',
        header: { Authorization: `Bearer ${t}` },
      })
      if (res.data.code === 200) {
        setEmployees(res.data.data.employees || [])
      }
    } catch (error) {
      console.log('获取员工列表失败:', error)
    }
  }

  const handleLogin = async () => {
    if (!username || !password) {
      Taro.showToast({ title: '请输入用户名和密码', icon: 'none' })
      return
    }
    try {
      const res = await Network.request({
        url: '/api/hr/auth/login',
        method: 'POST',
        data: { username, password },
      })
      if (res.data.code === 200) {
        const data = res.data.data
        setToken(data.token)
        setAdminRole(data.role || 'level1')
        setIsLoggedIn(true)
        Taro.setStorageSync('hr_token', data.token)
        Taro.setStorageSync('hr_role', data.role || 'level1')
        Taro.setStorageSync('hr_hrContacts', (data.hrContacts || []).join(','))
        Taro.setStorageSync('hr_username', username)
        fetchEmployees(data.token)
      } else {
        Taro.showToast({ title: res.data.message || res.data.msg || '登录失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error?.data?.message || error?.message || '登录失败', icon: 'none' })
    }
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setToken('')
    setAdminRole('')
    setUsername('')
    setPassword('')
    Taro.removeStorageSync('hr_token')
    Taro.removeStorageSync('hr_role')
    Taro.removeStorageSync('hr_hrContacts')
    Taro.removeStorageSync('hr_username')
  }

  const handleViewDetail = (employeeId: number) => {
    Taro.navigateTo({
      url: `/pages/hr-admin/detail/index?id=${employeeId}`
    })
  }

  const handleDeleteEmployee = async (employeeId: number) => {
    try {
      const res = await Taro.showModal({
        title: '确认删除',
        content: '确定要删除该员工的所有资料吗？此操作不可撤销。',
      })
      if (!res.confirm) return

      const response = await Network.request({
        url: `/api/hr/employees/${employeeId}/delete`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
      })
      if (response.data.code === 200) {
        Taro.showToast({ title: '删除成功', icon: 'success' })
        fetchEmployees()
      } else {
        Taro.showToast({
          title: response.data.message || response.data.msg || '删除失败',
          icon: 'none',
        })
      }
    } catch (error: any) {
      Taro.showToast({
        title: error?.data?.message || error?.data?.msg || error?.message || '删除失败',
        icon: 'none',
      })
    }
  }

  const handleDownloadAll = async () => {
    try {
      Taro.showLoading({ title: '准备下载...' })
      const res = await Network.request({
        url: '/api/hr/employees/download-all',
        header: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
      })
      Taro.hideLoading()
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `员工资料_${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(url)
      Taro.showToast({ title: '下载成功', icon: 'success' })
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({ title: '下载失败', icon: 'none' })
    }
  }

  // 管理员管理
  const fetchAdminList = async () => {
    try {
      const res = await Network.request({
        url: '/api/hr/admins',
        header: { Authorization: `Bearer ${token}` },
      })
      if (res.data.code === 200) {
        setAdminList(res.data.data.admins || [])
      }
    } catch (error) {
      console.log('获取管理员列表失败:', error)
    }
  }

  const handleCreateAdmin = async () => {
    if (!newAdminUsername || !newAdminPassword) {
      Taro.showToast({ title: '请填写用户名和密码', icon: 'none' })
      return
    }
    try {
      const res = await Network.request({
        url: '/api/hr/admins',
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
        data: {
          username: newAdminUsername,
          password: newAdminPassword,
          role: newAdminRole,
          hrContacts: newAdminRole !== 'level1' ? newAdminHrContacts.split(',').map(s => s.trim()) : [],
        },
      })
      if (res.data.code === 200) {
        Taro.showToast({ title: '创建成功', icon: 'success' })
        setNewAdminUsername('')
        setNewAdminPassword('')
        fetchAdminList()
      } else {
        Taro.showToast({ title: res.data.message || res.data.msg || '创建失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error?.data?.message || error?.message || '创建失败', icon: 'none' })
    }
  }

  const handleDeleteAdmin = async (adminId: number) => {
    try {
      const res = await Taro.showModal({
        title: '确认删除',
        content: '确定要删除该管理员吗？',
      })
      if (!res.confirm) return

      const response = await Network.request({
        url: `/api/hr/admins/${adminId}/delete`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
      })
      if (response.data.code === 200) {
        Taro.showToast({ title: '删除成功', icon: 'success' })
        fetchAdminList()
      } else {
        Taro.showToast({ title: response.data.message || response.data.msg || '删除失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error?.data?.message || error?.message || '删除失败', icon: 'none' })
    }
  }

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) {
      Taro.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }
    try {
      const res = await Network.request({
        url: '/api/hr/auth/change-password',
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
        data: { oldPassword: oldPwd, newPassword: newPwd },
      })
      if (res.data.code === 200) {
        Taro.showToast({ title: '密码修改成功，请重新登录', icon: 'none' })
        setShowChangePwd(false)
        setOldPwd('')
        setNewPwd('')
        handleLogout()
      } else {
        Taro.showToast({ title: res.data.message || res.data.msg || '修改失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error?.data?.message || error?.message || '修改失败', icon: 'none' })
    }
  }

  const filteredEmployees = employees.filter(e =>
    e.name.includes(searchQuery) || e.phone?.includes(searchQuery)
  )

  const isH5 = Taro.getEnv() === Taro.ENV_TYPE.WEB

  // ==================== 登录页 ====================
  if (!isLoggedIn) {
    return (
      <View className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <View className="w-full max-w-sm">
          <View className="text-center mb-8">
            <Shield size={48} color="#1890ff" className="mx-auto mb-3" />
            <Text className="block text-2xl font-bold text-gray-800">HR管理系统</Text>
            <Text className="block text-sm text-gray-500 mt-1">员工入职资料管理</Text>
          </View>
          <Card>
            <CardContent className="p-6">
              <View className="mb-4">
                <Text className="block text-sm font-medium text-gray-600 mb-2">用户名</Text>
                <View className="bg-gray-50 rounded-xl px-4 py-3">
                  <Input
                    className="w-full bg-transparent"
                    placeholder="请输入用户名"
                    value={username}
                    onInput={e => setUsername(e.detail.value)}
                  />
                </View>
              </View>
              <View className="mb-6">
                <Text className="block text-sm font-medium text-gray-600 mb-2">密码</Text>
                <View className="bg-gray-50 rounded-xl px-4 py-3">
                  <Input
                    className="w-full bg-transparent"
                    password
                    placeholder="请输入密码"
                    value={password}
                    onInput={e => setPassword(e.detail.value)}
                  />
                </View>
              </View>
              <Button className="w-full" onClick={handleLogin}>
                <LogIn size={16} color="#fff" className="mr-2" />
                <Text className="text-white">登录</Text>
              </Button>
            </CardContent>
          </Card>
        </View>
      </View>
    )
  }

  // ==================== 管理员管理面板 ====================
  if (showAdminPanel) {
    return (
      <View className="min-h-screen bg-gray-50">
        <View className="bg-white border-b border-gray-200 px-4 py-3 flex items-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAdminPanel(false)}>
            <Text>返回</Text>
          </Button>
          <Text className="block text-lg font-semibold ml-2">管理员管理</Text>
        </View>
        <View className="p-4">
          <Card className="mb-4">
            <CardContent className="p-4">
              <Text className="block text-base font-semibold mb-3">创建新管理员</Text>
              <View className="mb-3">
                <Text className="block text-sm text-gray-600 mb-1">用户名</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input
                    className="w-full bg-transparent"
                    placeholder="输入用户名"
                    value={newAdminUsername}
                    onInput={e => setNewAdminUsername(e.detail.value)}
                  />
                </View>
              </View>
              <View className="mb-3">
                <Text className="block text-sm text-gray-600 mb-1">密码</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input
                    className="w-full bg-transparent"
                    password
                    placeholder="输入密码"
                    value={newAdminPassword}
                    onInput={e => setNewAdminPassword(e.detail.value)}
                  />
                </View>
              </View>
              <View className="mb-3">
                <Text className="block text-sm text-gray-600 mb-1">权限等级</Text>
                <View className="flex flex-row gap-2">
                  {['level1', 'level2', 'level3'].map(level => (
                    <Button
                      key={level}
                      size="sm"
                      variant={newAdminRole === level ? 'default' : 'outline'}
                      onClick={() => setNewAdminRole(level)}
                    >
                      <Text>{level === 'level1' ? '一级' : level === 'level2' ? '二级' : '三级'}</Text>
                    </Button>
                  ))}
                </View>
              </View>
              {newAdminRole !== 'level1' && (
                <View className="mb-3">
                  <Text className="block text-sm text-gray-600 mb-1">对接HR</Text>
                  <View className="flex flex-row gap-2">
                    {['魏经理', '孙经理'].map(contact => (
                      <Button
                        key={contact}
                        size="sm"
                        variant={newAdminHrContacts.includes(contact) ? 'default' : 'outline'}
                        onClick={() => setNewAdminHrContacts(contact)}
                      >
                        <Text>{contact}</Text>
                      </Button>
                    ))}
                  </View>
                </View>
              )}
              <Button className="w-full mt-2" onClick={handleCreateAdmin}>
                <Text className="text-white">创建管理员</Text>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <View className="flex flex-row items-center justify-between mb-3">
                <Text className="block text-base font-semibold">管理员列表</Text>
                <Button size="sm" variant="outline" onClick={fetchAdminList}>
                  <Text>刷新</Text>
                </Button>
              </View>
              {adminList.length === 0 ? (
                <Text className="block text-sm text-gray-500 text-center py-4">点击刷新加载管理员列表</Text>
              ) : (
                adminList.map(admin => (
                  <View key={admin.id} className="flex flex-row items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <View>
                      <Text className="block text-sm font-medium">{admin.username}</Text>
                      <Text className="block text-xs text-gray-500">{admin.role} · {admin.hr_contacts?.join(', ') || '全部'}</Text>
                    </View>
                    {admin.role !== 'level1' && (
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteAdmin(admin.id)}>
                        <Trash2 size={14} color="#fff" />
                      </Button>
                    )}
                  </View>
                ))
              )}
            </CardContent>
          </Card>
        </View>
      </View>
    )
  }

  // ==================== 修改密码 ====================
  if (showChangePwd) {
    return (
      <View className="min-h-screen bg-gray-50">
        <View className="bg-white border-b border-gray-200 px-4 py-3 flex items-center">
          <Button variant="ghost" size="sm" onClick={() => setShowChangePwd(false)}>
            <Text>返回</Text>
          </Button>
          <Text className="block text-lg font-semibold ml-2">修改密码</Text>
        </View>
        <View className="p-4">
          <Card>
            <CardContent className="p-4">
              <View className="mb-3">
                <Text className="block text-sm text-gray-600 mb-1">旧密码</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input
                    className="w-full bg-transparent"
                    password
                    placeholder="输入旧密码"
                    value={oldPwd}
                    onInput={e => setOldPwd(e.detail.value)}
                  />
                </View>
              </View>
              <View className="mb-4">
                <Text className="block text-sm text-gray-600 mb-1">新密码</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input
                    className="w-full bg-transparent"
                    password
                    placeholder="输入新密码"
                    value={newPwd}
                    onInput={e => setNewPwd(e.detail.value)}
                  />
                </View>
              </View>
              <Button className="w-full" onClick={handleChangePassword}>
                <KeyRound size={16} color="#fff" className="mr-2" />
                <Text className="text-white">确认修改</Text>
              </Button>
            </CardContent>
          </Card>
        </View>
      </View>
    )
  }

  // ==================== 员工列表 ====================
  return (
    <View className="min-h-screen bg-gray-50">
      {/* 顶部栏 */}
      <View className="bg-white border-b border-gray-200 px-4 py-3">
        <View className="flex flex-row items-center justify-between">
          <View className="flex flex-row items-center">
            <Shield size={20} color="#1890ff" className="mr-2" />
            <Text className="block text-lg font-bold">HR管理系统</Text>
          </View>
          <View className="flex flex-row items-center gap-2">
            {adminRole === 'level1' && (
              <Button size="sm" variant="outline" onClick={() => { setShowAdminPanel(true); fetchAdminList() }}>
                <Users size={14} color="#666" className="mr-1" />
                <Text>管理员</Text>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowChangePwd(true)}>
              <KeyRound size={14} color="#666" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleLogout}>
              <Text>退出</Text>
            </Button>
          </View>
        </View>
        {adminRole && (
          <View className="mt-1">
            <Badge variant="outline">{adminRole === 'level1' ? '一级管理员' : adminRole === 'level2' ? '二级管理员' : '三级管理员'}</Badge>
          </View>
        )}
      </View>

      {/* 搜索栏 */}
      <View className="p-3">
        <View className="bg-white rounded-xl px-3 py-2 flex flex-row items-center">
          <Search size={16} color="#999" className="mr-2" />
          <Input
            className="flex-1 bg-transparent"
            placeholder="搜索姓名或手机号"
            value={searchQuery}
            onInput={e => setSearchQuery(e.detail.value)}
          />
        </View>
      </View>

      {/* 操作栏 */}
      <View className="px-3 pb-2 flex flex-row gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => fetchEmployees()}>
          <Text>刷新</Text>
        </Button>
        {isH5 && (
          <Button size="sm" variant="outline" className="flex-1" onClick={handleDownloadAll}>
            <Text>下载全部</Text>
          </Button>
        )}
      </View>

      {/* 员工列表 */}
      <View className="px-3 pb-4">
        {filteredEmployees.length === 0 ? (
          <View className="text-center py-12">
            <Text className="block text-gray-400">暂无员工数据</Text>
          </View>
        ) : (
          filteredEmployees.map(emp => (
            <Card key={emp.id} className="mb-2" onClick={() => handleViewDetail(emp.id)}>
              <CardContent className="p-3">
                <View className="flex flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex flex-row items-center gap-2 mb-1">
                      <Text className="block text-base font-semibold">{emp.name}</Text>
                      <Badge className={STATUS_MAP[emp.status]?.className || 'bg-gray-100 text-gray-600'}>
                        <Text>{STATUS_MAP[emp.status]?.label || emp.status}</Text>
                      </Badge>
                      {(emp.viewing_count || 0) > 0 && (
                        <Badge className="bg-blue-100 text-blue-700">
                          <Text>查看中</Text>
                        </Badge>
                      )}
                    </View>
                    <View className="flex flex-row items-center gap-3 text-xs text-gray-500">
                      <View className="flex flex-row items-center gap-1">
                        <Phone size={12} color="#999" />
                        <Text>{emp.phone || '未填写'}</Text>
                      </View>
                      <View className="flex flex-row items-center gap-1">
                        <Calendar size={12} color="#999" />
                        <Text>{emp.join_date || '未填写'}</Text>
                      </View>
                      {emp.hr_contact && (
                        <View className="flex flex-row items-center gap-1">
                          <User size={12} color="#999" />
                          <Text>{emp.hr_contact}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View className="flex flex-row items-center gap-1">
                    {adminRole !== 'level3' && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e: any) => { e.stopPropagation(); handleDeleteEmployee(emp.id) }}
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </Button>
                        {emp.status === 'locked' && (
                          <View className="flex flex-row items-center">
                            <Lock size={14} color="#ef4444" />
                          </View>
                        )}
                      </>
                    )}
                    <Eye size={16} color="#999" />
                  </View>
                </View>
              </CardContent>
            </Card>
          ))
        )}
      </View>
    </View>
  )
}

import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Download, Search, LogIn, User, Calendar, Phone } from 'lucide-react-taro'

const HrAdminPage = () => {
  const [token, setToken] = useState<string>('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // 登录
  const handleLogin = async () => {
    if (!username || !password) {
      Taro.showToast({ title: '请输入用户名和密码', icon: 'none' })
      return
    }

    try {
      setLoading(true)
      const res = await Network.request({
        url: '/api/hr/auth/login',
        method: 'POST',
        data: { username, password },
      })

      if (res.data.code === 200) {
        setToken(res.data.data.token)
        setIsLoggedIn(true)
        Taro.showToast({ title: '登录成功', icon: 'success' })
        // 加载员工列表
        loadEmployeeList(res.data.data.token)
      } else {
        Taro.showToast({ title: res.data.msg || '登录失败', icon: 'none' })
      }
    } catch (error: any) {
      console.error('登录失败:', error)
      Taro.showToast({ title: '登录失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 加载员工列表
  const loadEmployeeList = async (authToken?: string) => {
    try {
      setLoading(true)
      const res = await Network.request({
        url: '/api/hr/employees',
        method: 'GET',
        header: {
          Authorization: `Bearer ${authToken || token}`,
        },
      })

      if (res.data.code === 200) {
        setEmployees(res.data.data.employees || [])
      } else {
        Taro.showToast({ title: res.data.msg || '加载失败', icon: 'none' })
      }
    } catch (error: any) {
      console.error('加载员工列表失败:', error)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 查看员工详情
  const viewEmployeeDetail = (employeeId: number) => {
    Taro.showModal({
      title: '功能提示',
      content: `员工ID: ${employeeId}\n详情页面开发中`,
      showCancel: false,
    })
  }

  // 下载员工资料
  const downloadEmployeeFiles = (employeeId: number, employeeName: string) => {
    Taro.showModal({
      title: '下载确认',
      content: `是否下载 ${employeeName} 的所有资料？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            // 在 H5 环境中直接跳转下载链接
            const downloadUrl = `/api/hr/employees/${employeeId}/download`
            window.open(`http://localhost:3000${downloadUrl}?token=${token}`)
            Taro.showToast({ title: '开始下载', icon: 'success' })
          } catch (error) {
            console.error('下载失败:', error)
            Taro.showToast({ title: '下载失败', icon: 'none' })
          }
        }
      },
    })
  }

  // 获取状态标签
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Badge variant="secondary">已提交</Badge>
      case 'completed':
        return <Badge variant="default">已完成</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (!isLoggedIn) {
    return (
      <View className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <View className="mb-6">
              <Text className="block text-2xl font-bold text-center text-gray-900 mb-2">
                HR 管理系统
              </Text>
              <Text className="block text-sm text-center text-gray-600">
                请登录以查看员工资料
              </Text>
            </View>

            <View className="space-y-4">
              <View>
                <Label className="mb-2">用户名</Label>
                <Input
                  className="w-full"
                  placeholder="请输入用户名"
                  value={username}
                  onInput={(e) => setUsername(e.detail.value)}
                />
              </View>

              <View>
                <Label className="mb-2">密码</Label>
                <View className="bg-gray-50 rounded-lg px-4 py-3">
                  <Input
                    className="w-full bg-transparent"
                    type="text"
                    password
                    placeholder="请输入密码"
                    value={password}
                    onInput={(e) => setPassword(e.detail.value)}
                  />
                </View>
              </View>

              <Button
                className="w-full"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? '登录中...' : '登录'}
              </Button>

              <View className="mt-4 p-3 bg-blue-50 rounded-lg">
                <Text className="block text-xs text-gray-600">
                  默认账号：admin / admin123
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>
    )
  }

  return (
    <View className="min-h-screen bg-gray-50">
      <View className="bg-white border-b border-gray-200 p-4 sticky top-0 z-10">
        <Text className="block text-lg font-bold text-gray-900 mb-2">
          HR 管理系统
        </Text>
        <View className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadEmployeeList()}
          >
            <Search size={14} color="#6b7280" className="mr-1" />
            刷新
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsLoggedIn(false)}
          >
            <LogIn size={14} color="#6b7280" className="mr-1" />
            退出
          </Button>
        </View>
      </View>

      <View className="p-4">
        {employees.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Text className="block text-gray-500">
                暂无员工数据
              </Text>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">姓名</TableHead>
                    <TableHead className="w-32">手机号</TableHead>
                    <TableHead className="w-24">状态</TableHead>
                    <TableHead className="w-32">提交时间</TableHead>
                    <TableHead className="w-32">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <View className="flex items-center gap-2">
                          <User size={16} color="#6b7280" />
                          <Text className="font-medium">{employee.name}</Text>
                        </View>
                      </TableCell>
                      <TableCell>
                        <View className="flex items-center gap-2">
                          <Phone size={16} color="#6b7280" />
                          <Text className="text-sm">{employee.phone}</Text>
                        </View>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(employee.status)}
                      </TableCell>
                      <TableCell>
                        <View className="flex items-center gap-2">
                          <Calendar size={16} color="#6b7280" />
                          <Text className="text-xs text-gray-600">
                            {new Date(employee.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                      </TableCell>
                      <TableCell>
                        <View className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewEmployeeDetail(employee.id)}
                          >
                            查看
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadEmployeeFiles(employee.id, employee.name)}
                          >
                            <Download size={14} color="#6b7280" />
                          </Button>
                        </View>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </View>
    </View>
  )
}

export default HrAdminPage

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { countryCodes } from '../../lib/countryCodes';
import { Plus, Edit, Users, Mail, Phone, Briefcase, UserX, UserCheck, Search } from 'lucide-react';

interface Employee {
  id: string;
  username: string;
  full_name: string;
  full_name_ar: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  employee_services?: Array<{
    service_id: string;
    shift_id: string | null;
    duration_minutes: number | null;
    capacity_per_slot: number | null;
    services: {
      name: string;
      name_ar: string;
    };
  }>;
}

interface Service {
  id: string;
  name: string;
  name_ar: string;
  capacity_mode: 'employee_based' | 'service_based';
  service_duration_minutes: number;
  service_capacity_per_slot: number | null;
}

interface Shift {
  id: string;
  service_id: string;
  days_of_week: number[];
  start_time_utc: string;
  end_time_utc: string;
  is_active: boolean;
}

interface ServiceShiftAssignment {
  serviceId: string;
  shiftIds: string[];
  durationMinutes?: number;
  capacityPerSlot?: number;
}

export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const { userProfile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    full_name_ar: '',
    email: '',
    phone: '',
    role: 'employee' as 'employee' | 'receptionist' | 'cashier',
    assigned_services: [] as string[],
    service_shift_assignments: [] as ServiceShiftAssignment[],
  });
  const [serviceCapacitySettings, setServiceCapacitySettings] = useState<Record<string, { duration: number; capacity: number }>>({});
  const [phoneFull, setPhoneFull] = useState<string>(''); // Full phone number with country code
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<'all' | 'employee' | 'cashier' | 'receptionist'>('all');

  useEffect(() => {
    fetchServices();
    fetchEmployees();
  }, [userProfile]);

  async function fetchServices() {
    if (!userProfile?.tenant_id) return;
    const { data } = await db
      .from('services')
      .select('id, name, name_ar, capacity_mode, service_duration_minutes, service_capacity_per_slot')
      .eq('tenant_id', userProfile.tenant_id)
      .eq('is_active', true)
      .order('name');
    setServices(data || []);
  }

  async function fetchShiftsForServices(serviceIds: string[]) {
    if (serviceIds.length === 0) {
      setShifts([]);
      return;
    }
    const { data } = await db
      .from('shifts')
      .select('*')
      .in('service_id', serviceIds)
      .eq('is_active', true)
      .order('start_time_utc');
    setShifts(data || []);
  }

  async function fetchEmployees() {
    if (!userProfile?.tenant_id) return;

    try {
      const { data, error } = await db
        .from('users')
        .select(`
          id,
          username,
          full_name,
          full_name_ar,
          email,
          phone,
          role,
          is_active,
          employee_services(
            service_id,
            shift_id,
            duration_minutes,
            capacity_per_slot,
            services(name, name_ar)
          )
        `)
        .eq('tenant_id', userProfile.tenant_id)
        .in('role', ['employee', 'receptionist', 'cashier'])
        .order('full_name');

      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!userProfile?.tenant_id) return;

    try {
      if (editingEmployee) {
        const { data: { session } } = await db.auth.getSession();
        if (!session) {
          alert('Session expired. Please login again.');
          return;
        }

        // Use backend API endpoint
        const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/employees/update`;

        const updatePayload: any = {
          employee_id: editingEmployee.id,
          full_name: formData.full_name,
          full_name_ar: formData.full_name_ar,
          phone: phoneFull || null,
          role: formData.role,
        };

        if (formData.username && formData.username !== editingEmployee.username) {
          updatePayload.username = formData.username;
        }

        if (formData.password) {
          updatePayload.password = formData.password;
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        });

        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          console.error('Non-JSON response:', text.substring(0, 200));
          alert(`Error updating employee: Server returned ${response.status} ${response.statusText}. Please check the console for details.`);
          return;
        }

        const result = await response.json();

        if (!response.ok) {
          console.error('Update error:', result.error);
          alert(`Error updating employee: ${result.error || 'Unknown error'}`);
          return;
        }

        if (formData.role === 'employee') {
          await db
            .from('employee_services')
            .delete()
            .eq('employee_id', editingEmployee.id);

          if (formData.service_shift_assignments.length > 0) {
            const assignments: any[] = [];
            formData.service_shift_assignments.forEach(serviceAssignment => {
              if (serviceAssignment.shiftIds.length > 0) {
                serviceAssignment.shiftIds.forEach(shift_id => {
                  assignments.push({
                    employee_id: editingEmployee.id,
                    service_id: serviceAssignment.serviceId,
                    shift_id,
                    tenant_id: userProfile.tenant_id,
                    duration_minutes: serviceAssignment.durationMinutes,
                    capacity_per_slot: serviceAssignment.capacityPerSlot
                  });
                });
              }
            });
            if (assignments.length > 0) {
              const { error: insertError } = await db.from('employee_services').insert(assignments);
              if (insertError) {
                console.error('Error inserting employee_services:', insertError);
                alert(`Error saving service assignments: ${insertError.message}`);
                return;
              }
            }
          }
        }

        if (formData.password) {
          alert(`Employee updated successfully!\nNew Username: ${formData.username}\nNew Password: ${formData.password}`);
        } else {
          alert('Employee updated successfully!');
        }
      } else {
        const { data: { session } } = await db.auth.getSession();
        if (!session) {
          alert('Session expired. Please login again.');
          return;
        }

        // Use backend API endpoint
        const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/employees/create`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: formData.username,
            password: formData.password,
            full_name: formData.full_name,
            full_name_ar: formData.full_name_ar,
            email: formData.email || null,
            phone: phoneFull || null,
            role: formData.role,
            tenant_id: userProfile.tenant_id,
            service_shift_assignments: formData.service_shift_assignments,
          }),
        });

        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          console.error('Non-JSON response:', text);
          alert(`Error creating employee: Server returned ${response.status} ${response.statusText}`);
          return;
        }

        const result = await response.json();

        if (!response.ok) {
          console.error('Creation error:', result.error);
          alert(`Error creating employee: ${result.error || 'Unknown error'}`);
          return;
        }

        alert(`Employee created successfully!\nUsername: ${formData.username}\nPassword: ${formData.password}`);
      }

      setIsModalOpen(false);
      setEditingEmployee(null);
      resetForm();
      await fetchEmployees();
    } catch (err: any) {
      console.error('Error saving employee:', err);
      alert(`Error: ${err.message || 'Unknown error occurred'}`);
    }
  }

  async function openEditModal(employee: Employee) {
    setEditingEmployee(employee);
    const assignedServices = employee.employee_services?.map(es => es.service_id) || [];

    if (assignedServices.length > 0) {
      await fetchShiftsForServices(assignedServices);
    }

    const serviceShiftMap: ServiceShiftAssignment[] = [];
    const uniqueServiceIds = [...new Set(assignedServices)];

    for (const serviceId of uniqueServiceIds) {
      const serviceAssignments = employee.employee_services?.filter(es => es.service_id === serviceId) || [];
      const shiftIds = serviceAssignments
        .map(es => es.shift_id)
        .filter(id => id) as string[];

      // Get duration and capacity from the first assignment (they should be the same for all shifts of this service)
      const firstAssignment = serviceAssignments[0];

      serviceShiftMap.push({
        serviceId,
        shiftIds,
        durationMinutes: firstAssignment?.duration_minutes || 60,
        capacityPerSlot: firstAssignment?.capacity_per_slot || 1
      });
    }

    setFormData({
      username: employee.username,
      password: '',
      full_name: employee.full_name,
      full_name_ar: employee.full_name_ar || '',
      email: employee.email || '',
      phone: employee.phone || '',
      role: employee.role as 'employee' | 'receptionist' | 'cashier',
      assigned_services: uniqueServiceIds,
      service_shift_assignments: serviceShiftMap,
    });
    // Set full phone number (with country code) for PhoneInput
    setPhoneFull(employee.phone || '');
    setIsModalOpen(true);
  }

  function resetForm() {
    setFormData({
      username: '',
      password: '',
      full_name: '',
      full_name_ar: '',
      email: '',
      phone: '',
      role: 'employee',
      assigned_services: [],
      service_shift_assignments: [],
    });
    setPhoneFull('');
    setShifts([]);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingEmployee(null);
    resetForm();
  }

  async function toggleEmployeeStatus(employeeId: string, currentStatus: boolean) {
    if (!userProfile?.tenant_id) return;

    const confirmMessage = currentStatus
      ? 'Are you sure you want to deactivate this employee? They will not be able to login.'
      : 'Are you sure you want to activate this employee?';

    if (!confirm(confirmMessage)) return;

    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session) {
        alert('Session expired. Please login again.');
        return;
      }

      // Use backend API endpoint
      const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/employees/update`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee_id: employeeId,
          is_active: !currentStatus,
        }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text.substring(0, 200));
        alert(`Error: Server returned ${response.status} ${response.statusText}. Please check the console for details.`);
        return;
      }

      const result = await response.json();

      if (!response.ok) {
        console.error('Status update error:', result.error);
        alert(`Error: ${result.error || 'Unknown error'}`);
        return;
      }

      await fetchEmployees();
      alert(`Employee ${currentStatus ? 'deactivated' : 'activated'} successfully!`);
    } catch (err: any) {
      console.error('Error toggling employee status:', err);
      alert(`Error: ${err.message || 'Unknown error occurred'}`);
    }
  }

  function toggleService(serviceId: string) {
    setFormData(prev => {
      const isRemoving = prev.assigned_services.includes(serviceId);
      const newAssignedServices = isRemoving
        ? prev.assigned_services.filter(id => id !== serviceId)
        : [...prev.assigned_services, serviceId];

      const service = services.find(s => s.id === serviceId);

      const newServiceShiftAssignments = isRemoving
        ? prev.service_shift_assignments.filter(a => a.serviceId !== serviceId)
        : [...prev.service_shift_assignments, {
            serviceId,
            shiftIds: [],
            durationMinutes: service?.capacity_mode === 'service_based'
              ? service.service_duration_minutes
              : (serviceCapacitySettings[serviceId]?.duration || 60),
            capacityPerSlot: service?.capacity_mode === 'service_based'
              ? (service.service_capacity_per_slot || 1)
              : (serviceCapacitySettings[serviceId]?.capacity || 1)
          }];

      fetchShiftsForServices(newAssignedServices);

      return {
        ...prev,
        assigned_services: newAssignedServices,
        service_shift_assignments: newServiceShiftAssignments
      };
    });
  }

  function toggleShiftForService(serviceId: string, shiftId: string) {
    setFormData(prev => {
      const newAssignments = prev.service_shift_assignments.map(assignment => {
        if (assignment.serviceId === serviceId) {
          const isRemoving = assignment.shiftIds.includes(shiftId);
          return {
            ...assignment,
            shiftIds: isRemoving
              ? assignment.shiftIds.filter(id => id !== shiftId)
              : [...assignment.shiftIds, shiftId]
          };
        }
        return assignment;
      });
      return { ...prev, service_shift_assignments: newAssignments };
    });
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayNamesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{t('employee.employees')}</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">{t('employee.manageTeam')}</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          {t('employee.addEmployee')}
        </Button>
      </div>

      {/* Search and Filter Section */}
      {employees.length > 0 && (
        <div className="mb-6 space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder={i18n.language === 'ar' ? 'ابحث عن موظف...' : 'Search employees...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Role Filter Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button
              variant={selectedRole === 'all' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSelectedRole('all')}
            >
              {i18n.language === 'ar' ? 'الكل' : 'All'} ({employees.length})
            </Button>
            <Button
              variant={selectedRole === 'employee' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSelectedRole('employee')}
            >
              {t('employee.roles.employee')} ({employees.filter(e => e.role === 'employee').length})
            </Button>
            <Button
              variant={selectedRole === 'cashier' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSelectedRole('cashier')}
            >
              {t('employee.roles.cashier')} ({employees.filter(e => e.role === 'cashier').length})
            </Button>
            <Button
              variant={selectedRole === 'receptionist' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSelectedRole('receptionist')}
            >
              {t('employee.roles.receptionist')} ({employees.filter(e => e.role === 'receptionist').length})
            </Button>
          </div>
        </div>
      )}

      {/* Filtered Employees */}
      {(() => {
        // Filter employees by role
        let filteredEmployees = employees;
        if (selectedRole !== 'all') {
          filteredEmployees = employees.filter(emp => emp.role === selectedRole);
        }

        // Filter employees by search query
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          filteredEmployees = filteredEmployees.filter(emp => {
            const fullName = (i18n.language === 'ar' ? (emp.full_name_ar || emp.full_name) : emp.full_name).toLowerCase();
            const fullNameAr = (emp.full_name_ar || '').toLowerCase();
            const username = (emp.username || '').toLowerCase();
            const email = (emp.email || '').toLowerCase();
            const phone = (emp.phone || '').toLowerCase();
            
            return fullName.includes(query) || 
                   fullNameAr.includes(query) || 
                   username.includes(query) || 
                   email.includes(query) || 
                   phone.includes(query);
          });
        }

        if (filteredEmployees.length === 0) {
          return (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchQuery || selectedRole !== 'all' 
                    ? (i18n.language === 'ar' ? 'لا توجد نتائج' : 'No results found')
                    : t('employee.noEmployeesYet')}
                </h3>
                <p className="text-gray-600 mb-6">
                  {searchQuery || selectedRole !== 'all'
                    ? (i18n.language === 'ar' ? 'جرب البحث بكلمات مختلفة أو اختر تصنيف آخر' : 'Try different search terms or select another category')
                    : t('employee.startBuildingTeam')}
                </p>
                {!searchQuery && selectedRole === 'all' && (
                  <Button onClick={() => setIsModalOpen(true)} icon={<Plus className="w-4 h-4" />}>
                    {t('employee.addEmployee')}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        }

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEmployees.map((employee) => (
            <Card key={employee.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">
                    {i18n.language === 'ar' ? (employee.full_name_ar || employee.full_name) : employee.full_name}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    employee.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {employee.is_active ? t('employee.active') : t('employee.inactive')}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  {employee.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{employee.email}</span>
                    </div>
                  )}
                  {employee.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4" />
                      <span>{employee.phone}</span>
                    </div>
                  )}
                  <div className="mt-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                      {t(`employee.roles.${employee.role}`)}
                    </span>
                  </div>
                  {employee.role === 'employee' && employee.employee_services && employee.employee_services.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                        <Briefcase className="w-3 h-3" />
                        <span>{t('employee.assignedServices')}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {employee.employee_services.map((es, idx) => (
                          <span key={idx} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                            {i18n.language === 'ar' ? es.services.name_ar : es.services.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditModal(employee)}
                    icon={<Edit className="w-4 h-4" />}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant={employee.is_active ? "secondary" : "primary"}
                    size="sm"
                    className="flex-1"
                    onClick={() => toggleEmployeeStatus(employee.id, employee.is_active)}
                    icon={employee.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  >
                    {employee.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </CardContent>
            </Card>
            ))}
          </div>
        );
      })()}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingEmployee ? t('employee.editEmployee') : t('employee.addEmployee')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={`Username ${!editingEmployee ? '*' : ''}`}
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required={!editingEmployee}
            disabled={editingEmployee !== null}
            placeholder="username"
            className={editingEmployee ? 'bg-gray-100' : ''}
          />

          <Input
            type="password"
            label={`Password ${!editingEmployee ? '*' : '(Leave blank to keep current)'}`}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required={!editingEmployee}
            placeholder="••••••••"
          />

          <Input
            label={t('employee.fullNameEnglish')}
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            required
            placeholder="Full name in English"
          />

          <Input
            label={t('employee.fullNameArabic')}
            value={formData.full_name_ar}
            onChange={(e) => setFormData({ ...formData, full_name_ar: e.target.value })}
            required
            dir="rtl"
            placeholder="الاسم الكامل بالعربية"
          />

          <Input
            type="email"
            label={t('employee.email')}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={!!editingEmployee}
            placeholder="email@example.com (optional)"
          />

          <PhoneInput
            label={t('employee.phone')}
            value={phoneFull}
            onChange={(value) => {
              setPhoneFull(value);
              // Extract phone number without country code for backward compatibility
              let phoneNumber = value;
              for (const country of countryCodes) {
                if (value.startsWith(country.code)) {
                  phoneNumber = value.replace(country.code, '');
                  break;
                }
              }
              setFormData({ ...formData, phone: phoneNumber });
            }}
            defaultCountry="+966"
            placeholder="+966 50 123 4567"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('employee.role')}
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as 'employee' | 'receptionist' | 'cashier' })}
              required
            >
              <option value="employee">{t('employee.roles.employee')}</option>
              <option value="receptionist">{t('employee.roles.receptionist')}</option>
              <option value="cashier">{t('employee.roles.cashier')}</option>
            </select>
          </div>

          {formData.role === 'employee' && services.length > 0 && (
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('employee.assignServices')}
              </label>
              <div className="max-h-96 overflow-y-auto space-y-3 bg-gray-50 p-3 rounded-lg">
                {services.map((service) => {
                  const isServiceSelected = formData.assigned_services.includes(service.id);
                  const serviceShifts = shifts.filter(s => s.service_id === service.id);
                  const serviceAssignment = formData.service_shift_assignments.find(a => a.serviceId === service.id);

                  return (
                    <div key={service.id} className="bg-white p-3 rounded-lg border">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isServiceSelected}
                          onChange={() => toggleService(service.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium">
                          {i18n.language === 'ar' ? service.name_ar : service.name}
                        </span>
                      </label>

                      {isServiceSelected && service.capacity_mode === 'employee_based' && (
                        <div className="mt-3 ml-6 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Duration (minutes) *
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={serviceAssignment?.durationMinutes || 60}
                              onChange={(e) => {
                                const duration = parseInt(e.target.value) || 60;
                                setFormData(prev => ({
                                  ...prev,
                                  service_shift_assignments: prev.service_shift_assignments.map(a =>
                                    a.serviceId === service.id ? { ...a, durationMinutes: duration } : a
                                  )
                                }));
                              }}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Capacity per Slot *
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={serviceAssignment?.capacityPerSlot || 1}
                              onChange={(e) => {
                                const capacity = parseInt(e.target.value) || 1;
                                setFormData(prev => ({
                                  ...prev,
                                  service_shift_assignments: prev.service_shift_assignments.map(a =>
                                    a.serviceId === service.id ? { ...a, capacityPerSlot: capacity } : a
                                  )
                                }));
                              }}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              required
                            />
                          </div>
                        </div>
                      )}

                      {isServiceSelected && service.capacity_mode === 'service_based' && (
                        <div className="mt-3 ml-6 bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="text-xs text-blue-800">
                            <div className="font-medium mb-1">Service-Based Capacity</div>
                            <div className="space-y-0.5">
                              <div>Duration: {service.service_duration_minutes} minutes</div>
                              <div>Capacity: {service.service_capacity_per_slot || 1} per slot</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {isServiceSelected && serviceShifts.length > 0 && (
                        <div className="mt-3 ml-6 space-y-2 pl-3 border-l-2 border-gray-200">
                          <div className="text-xs font-medium text-gray-600 mb-2">
                            Select Shifts:
                          </div>
                          {serviceShifts.map((shift) => (
                            <label key={shift.id} className="flex items-start gap-2 cursor-pointer text-xs">
                              <input
                                type="checkbox"
                                checked={serviceAssignment?.shiftIds.includes(shift.id) || false}
                                onChange={() => toggleShiftForService(service.id, shift.id)}
                                className="w-3 h-3 mt-0.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-gray-700">
                                  {shift.start_time_utc} - {shift.end_time_utc}
                                </div>
                                <div className="text-gray-500">
                                  {shift.days_of_week.sort().map(day =>
                                    i18n.language === 'ar' ? dayNamesAr[day] : dayNames[day]
                                  ).join(', ')}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}

                      {isServiceSelected && serviceShifts.length === 0 && (
                        <div className="mt-2 ml-6 text-xs text-amber-600">
                          No shifts configured for this service
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="submit" fullWidth>
              {editingEmployee ? t('common.save') : t('common.add')}
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={closeModal}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


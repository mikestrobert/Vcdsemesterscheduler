import { useState, useRef, useEffect } from 'react';
import { DndProvider, useDrag } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { CourseCard } from './components/CourseCard';
import { FacultyChip } from './components/FacultyChip';
import { CalendarGrid } from './components/CalendarGrid';
import { EditCourseDialog } from './components/EditCourseDialog';
import { INITIAL_COURSES } from './data/courses';
import { Course, Faculty, DayOfWeek, TIME_SLOTS, DAYS } from './types/course';
import { Calendar, Clock, Users, Upload, Trash2, Save, Check } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Textarea } from './components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './components/ui/accordion';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './components/ui/alert-dialog';
import * as XLSX from 'xlsx';
import { toast } from 'sonner@2.0.3';
import { motion } from 'motion/react';

const FACULTY: Faculty[] = ['Mike Strobert', 'Anne Jordan', 'Dan DeLuna', 'Adam Smith', 'Peter Byrne'];
const STORAGE_KEY = 'vcd-mfa-schedule';

// Simple available course card - only shows code and title
function AvailableCourseCard({ course }: { course: Course }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'COURSE',
    item: course,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      className={`p-2 bg-gray-50 rounded border border-gray-200 text-sm cursor-move hover:shadow-md transition-all ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <span className="font-semibold">{course.code}</span> - {course.title}
    </div>
  );
}

export default function App() {
  const [courses, setCourses] = useState<Course[]>(() => {
    // Try to load from localStorage on initial mount
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved courses:', e);
        return INITIAL_COURSES;
      }
    }
    return INITIAL_COURSES;
  });
  const [notes, setNotes] = useState('');
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearScheduleDialog, setShowClearScheduleDialog] = useState(false);
  const [isSaved, setIsSaved] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedRef = useRef<string>(JSON.stringify(INITIAL_COURSES));

  // Track changes to courses and mark as unsaved
  useEffect(() => {
    const currentState = JSON.stringify(courses);
    if (currentState !== lastSavedRef.current) {
      setIsSaved(false);
    }
  }, [courses]);

  // Generate next section number for a course code
  const getNextSectionNumber = (courseCode: string): string => {
    const existingSections = courses
      .filter(c => c.code === courseCode && c.sectionNumber)
      .map(c => parseInt(c.sectionNumber || '0'))
      .sort((a, b) => b - a);
    
    const nextNumber = existingSections.length > 0 ? existingSections[0] + 1 : 1;
    return nextNumber.toString().padStart(2, '0');
  };

  const handleDropCourse = (course: Course, day: DayOfWeek, time: string) => {
    // Calculate end time (default 2 hour 50 min block - typical RIT class)
    const startHour = parseInt(time.split(':')[0]);
    const startMinute = parseInt(time.split(':')[1]);
    const endHour = startHour + 2;
    const endMinute = startMinute + 50;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    
    // Create a new course instance with unique section number
    const sectionNumber = getNextSectionNumber(course.code);
    const newInstance: Course = {
      ...course,
      id: `${course.id}-${sectionNumber}`,
      sectionNumber,
      timeSlots: [{ day, startTime: time, endTime }],
      room: course.room === 'TBD' ? '07-1315' : course.room,
    };

    setEditingCourse(newInstance);
  };

  const handleSaveCourse = (updatedCourse: Course) => {
    // Check if this is a new instance or updating an existing one
    const existingIndex = courses.findIndex(c => c.id === updatedCourse.id);
    if (existingIndex >= 0) {
      // Update existing course
      setCourses(courses.map(c => c.id === updatedCourse.id ? updatedCourse : c));
    } else {
      // Add new instance
      setCourses([...courses, updatedCourse]);
    }
  };

  const handleUnscheduleCourse = (course: Course) => {
    // Remove the course instance entirely (only remove instances with section numbers)
    if (course.sectionNumber) {
      setCourses(courses.filter(c => c.id !== course.id));
    } else {
      // If it's a base course without section, just clear its time slots
      const updatedCourse: Course = {
        ...course,
        timeSlots: [],
      };
      setCourses(courses.map(c => c.id === course.id ? updatedCourse : c));
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        // Convert Excel data to Course objects
        const newCourses: Course[] = jsonData.map((row, index) => {
          const code = row['Course Code'] || row['Code'] || row['code'] || '';
          const title = row['Title'] || row['title'] || row['Course Title'] || '';
          const instructor = (row['Instructor'] || row['instructor'] || 'TBD') as Faculty;
          const room = row['Room'] || row['room'] || 'TBD';
          const status = (row['Status'] || row['status'] || 'backlog') as 'confirmed' | 'tentative' | 'backlog';

          return {
            id: code.toLowerCase().replace(/[^a-z0-9]/g, '-') || `course-${index}`,
            code: code,
            title: title,
            instructor: instructor,
            room: room,
            timeSlots: [],
            status: status,
          };
        }).filter(course => course.code && course.title); // Only include courses with code and title

        if (newCourses.length > 0) {
          // Merge with existing courses, avoiding duplicates by code
          const existingCodes = new Set(courses.map(c => c.code));
          const uniqueNewCourses = newCourses.filter(nc => !existingCodes.has(nc.code));
          
          setCourses([...courses, ...uniqueNewCourses]);
          toast.success(`Successfully imported ${uniqueNewCourses.length} courses`);
        } else {
          toast.error('No valid courses found in the spreadsheet');
        }
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        toast.error('Failed to parse Excel file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearAvailableCourses = () => {
    // Keep only scheduled courses (those with section numbers or time slots)
    const scheduledOnly = courses.filter(c => c.sectionNumber || c.timeSlots.length > 0);
    setCourses(scheduledOnly);
    setShowClearDialog(false);
    toast.success('Available courses cleared');
  };

  const handleSaveSchedule = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
      lastSavedRef.current = JSON.stringify(courses);
      setIsSaved(true);
      toast.success('Schedule saved successfully');
    } catch (error) {
      console.error('Failed to save schedule:', error);
      toast.error('Failed to save schedule');
    }
  };

  const handleClearSchedule = () => {
    // Remove all scheduled courses, keep only available courses
    const availableOnly = courses.filter(c => !c.sectionNumber && c.timeSlots.length === 0);
    setCourses(availableOnly);
    setShowClearScheduleDialog(false);
    toast.success('Schedule cleared');
  };

  // Scheduled courses are those with section numbers OR those with time slots
  const scheduledCourses = courses.filter(c => c.sectionNumber || c.timeSlots.length > 0);
  // Available courses are base courses (no section number and no time slots)
  const availableCourses = courses.filter(c => !c.sectionNumber && c.timeSlots.length === 0);
  
  // Get active faculty (those teaching scheduled courses) with course counts
  const activeFaculty = Array.from(new Set(scheduledCourses.map(c => c.instructor))).filter(Boolean) as Faculty[];
  const facultyCourseCount = (faculty: Faculty): number => {
    return scheduledCourses.filter(c => c.instructor === faculty && c.sectionNumber).length;
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <Toaster />
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-gray-900 mb-2">VCD MFA Fall Semester Course Planning</h1>
                <p className="text-gray-600">
                  Drag courses to schedule or click to edit
                </p>
              </div>
              <div className="flex items-center gap-3">
                <motion.div
                  animate={isSaved ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <Button
                    onClick={handleSaveSchedule}
                    variant={isSaved ? "outline" : "default"}
                    className={isSaved ? "border-green-600 text-green-600 hover:bg-green-50" : ""}
                  >
                    {isSaved ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                </motion.div>
                <Button
                  onClick={() => setShowClearScheduleDialog(true)}
                  variant="outline"
                  className="border-red-600 text-red-600 hover:bg-red-50"
                  disabled={scheduledCourses.length === 0}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Schedule
                </Button>
              </div>
            </div>
          </div>

          <Tabs defaultValue="schedule" className="space-y-4">
            <TabsList>
              <TabsTrigger value="schedule">
                <Calendar className="w-4 h-4 mr-2" />
                Weekly Schedule
              </TabsTrigger>
              <TabsTrigger value="courses">
                <Clock className="w-4 h-4 mr-2" />
                Course Lists
              </TabsTrigger>
            </TabsList>

            {/* Weekly Schedule Grid */}
            <TabsContent value="schedule">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Main Calendar - 10 columns */}
                <div className="lg:col-span-10">
                  <Card>
                    <CardHeader>
                      <CardTitle>Fall Semester Weekly Schedule</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="relative">
                        <CalendarGrid
                          scheduledCourses={scheduledCourses}
                          onDropCourse={handleDropCourse}
                          onUnschedule={handleUnscheduleCourse}
                          onEdit={setEditingCourse}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Sidebar - 2 columns */}
                <div className="lg:col-span-2">
                  <Card>
                      <CardContent className="p-0">
                        <Accordion type="multiple" defaultValue={['faculty', 'active', 'available']} className="w-full">
                          {/* Faculty Section */}
                          <AccordionItem value="faculty">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                <span>Faculty ({activeFaculty.length})</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="space-y-2">
                                {activeFaculty.length > 0 ? (
                                  activeFaculty.map(faculty => (
                                    <FacultyChip key={faculty} name={faculty} courseCount={facultyCourseCount(faculty)} />
                                  ))
                                ) : (
                                  <p className="text-sm text-gray-500">No active faculty</p>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>

                          {/* Active Courses Section */}
                          <AccordionItem value="active">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                <span>Active Courses ({scheduledCourses.length})</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {scheduledCourses.length > 0 ? (
                                  scheduledCourses.map(course => (
                                    <CourseCard
                                      key={course.id}
                                      course={course}
                                      onEdit={setEditingCourse}
                                    />
                                  ))
                                ) : (
                                  <p className="text-sm text-gray-500">No courses scheduled</p>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>

                          {/* Available Courses Section */}
                          <AccordionItem value="available">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                              <div className="flex items-center justify-between w-full pr-2">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  <span>Available Courses ({availableCourses.length})</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fileInputRef.current?.click();
                                    }}
                                    title="Upload Excel file"
                                  >
                                    <Upload className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowClearDialog(true);
                                    }}
                                    title="Clear available courses"
                                    disabled={availableCourses.length === 0}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {availableCourses.length > 0 ? (
                                  availableCourses.map(course => (
                                    <AvailableCourseCard
                                      key={course.id}
                                      course={course}
                                    />
                                  ))
                                ) : (
                                  <p className="text-sm text-gray-500">All courses scheduled</p>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardContent>
                    </Card>
                </div>
              </div>
            </TabsContent>

            {/* Course Lists */}
            <TabsContent value="courses">
              <div className="grid grid-cols-2 gap-6">
                {/* Scheduled Courses */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-green-700">
                      Scheduled Courses ({scheduledCourses.length})
                    </CardTitle>
                    <p className="text-sm text-gray-600">Courses currently on the calendar</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {scheduledCourses.map(course => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          onEdit={setEditingCourse}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Available Courses */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-gray-700">
                      Available Courses ({availableCourses.length})
                    </CardTitle>
                    <p className="text-sm text-gray-600">Courses not yet scheduled</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {availableCourses.map(course => (
                        <div
                          key={course.id}
                          className="p-2 bg-gray-50 rounded border border-gray-200 text-sm"
                        >
                          <span className="font-semibold">{course.code}</span> - {course.title}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Edit Course Dialog */}
        <EditCourseDialog
          course={editingCourse}
          open={!!editingCourse}
          onClose={() => setEditingCourse(null)}
          onSave={handleSaveCourse}
        />

        {/* Clear Available Courses Confirmation Dialog */}
        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Available Courses?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all {availableCourses.length} available course{availableCourses.length !== 1 ? 's' : ''} from the list. 
                Scheduled courses will not be affected. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearAvailableCourses}
                className="bg-red-600 hover:bg-red-700"
              >
                Clear Courses
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Clear Schedule Confirmation Dialog */}
        <AlertDialog open={showClearScheduleDialog} onOpenChange={setShowClearScheduleDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Schedule?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all {scheduledCourses.length} scheduled course{scheduledCourses.length !== 1 ? 's' : ''} from the calendar. 
                Available courses will not be affected. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearSchedule}
                className="bg-red-600 hover:bg-red-700"
              >
                Clear Schedule
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Hidden file input for Excel upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    </DndProvider>
  );
}

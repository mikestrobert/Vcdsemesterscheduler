import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Course, Faculty, DayOfWeek, DAYS } from '../types/course';
import { Check } from 'lucide-react';

interface EditCourseDialogProps {
  course: Course | null;
  open: boolean;
  onClose: () => void;
  onSave: (course: Course) => void;
  facultyList: Faculty[];
  onAddInstructor: (name: string) => void;
}

const ROOMS = ['07-1305', '07-1315', '07-1611', 'Other'];

export function EditCourseDialog({ course, open, onClose, onSave, facultyList, onAddInstructor }: EditCourseDialogProps) {
  const [editedCourse, setEditedCourse] = useState<Course | null>(course);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:50');
  const [instructorOpen, setInstructorOpen] = useState(false);

  // Update local state when course changes
  useEffect(() => {
    if (course) {
      setEditedCourse(course);
      // Initialize days from time slots
      const days = course.timeSlots.map(slot => slot.day);
      setSelectedDays(days);
      // Initialize times from first slot if available
      if (course.timeSlots.length > 0) {
        setStartTime(course.timeSlots[0].startTime);
        setEndTime(course.timeSlots[0].endTime);
      } else {
        setStartTime('09:00');
        setEndTime('11:50');
      }
    }
  }, [course]);

  if (!course || !editedCourse) return null;

  const handleSelectInstructor = (name: string) => {
    const trimmedName = name.trim();
    if (trimmedName) {
      onAddInstructor(trimmedName); // Add to global list if new
      setEditedCourse({ ...editedCourse, instructor: trimmedName });
    }
    setInstructorOpen(false);
  };

  const handleDayToggle = (day: DayOfWeek) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const handleSave = () => {
    // Create time slots based on selected days
    const timeSlots = selectedDays.map(day => ({
      day,
      startTime,
      endTime,
    }));

    onSave({
      ...editedCourse,
      timeSlots,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Course: {course.code}{course.sectionNumber ? ` ${course.sectionNumber}` : ''}</DialogTitle>
          <DialogDescription>
            Set the schedule, instructor, and room for this course.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label>Course</Label>
            <div className="p-2 bg-gray-50 rounded border border-gray-200">
              <span className="font-semibold">{editedCourse.code}{editedCourse.sectionNumber ? ` ${editedCourse.sectionNumber}` : ''}</span> - {editedCourse.title}
            </div>
          </div>

          <div>
            <Label className="mb-3 block">Days</Label>
            <div className="flex flex-wrap gap-4">
              {DAYS.map(day => (
                <div key={day} className="flex items-center space-x-2">
                  <Checkbox
                    id={`day-${day}`}
                    checked={selectedDays.includes(day)}
                    onCheckedChange={() => handleDayToggle(day)}
                  />
                  <Label htmlFor={`day-${day}`} className="cursor-pointer">
                    {day.charAt(0)}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Instructor</Label>
            <div className="relative">
              <Input
                type="text"
                value={editedCourse.instructor}
                onChange={(e) => setEditedCourse({ ...editedCourse, instructor: e.target.value })}
                onFocus={() => setInstructorOpen(true)}
                onBlur={() => {
                  // Delay closing to allow clicking on suggestions
                  setTimeout(() => setInstructorOpen(false), 200);
                }}
                placeholder="Type or select instructor..."
                className="w-full"
              />
              {instructorOpen && facultyList.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                  {facultyList
                    .filter((faculty) => 
                      faculty.toLowerCase().includes((editedCourse.instructor || '').toLowerCase())
                    )
                    .map((faculty) => (
                      <button
                        key={faculty}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
                        onClick={() => {
                          setEditedCourse({ ...editedCourse, instructor: faculty });
                          setInstructorOpen(false);
                        }}
                      >
                        <Check
                          className={`w-4 h-4 ${
                            editedCourse.instructor === faculty ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        {faculty}
                      </button>
                    ))}
                  {editedCourse.instructor && 
                   !facultyList.includes(editedCourse.instructor) && 
                   editedCourse.instructor.trim() !== '' && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2 border-t border-gray-200 text-blue-600"
                      onClick={() => {
                        onAddInstructor(editedCourse.instructor);
                        setInstructorOpen(false);
                      }}
                    >
                      <Check className="w-4 h-4 opacity-0" />
                      Add "{editedCourse.instructor}"
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label>Room</Label>
            <Select
              value={editedCourse.room}
              onValueChange={(value) => setEditedCourse({ ...editedCourse, room: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOMS.map(room => (
                  <SelectItem key={room} value={room}>{room}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export function useTour() {
  useEffect(() => {
    const hasSeen = localStorage.getItem('wicars_tour_done')
    if (hasSeen) return

    const driverObj = driver({
      showProgress: true,
      steps: [
        {
          element: '#sidebar-dashboard',
          popover: {
            title: 'Dashboard',
            description: 'Your system overview — schedules, stats, and alerts.',
            side: 'right',
            align: 'start'
          }
        },
        {
          element: '#sidebar-schedules',
          popover: {
            title: 'Class Schedules',
            description: 'View all finalized conflict-free schedules here.',
            side: 'right',
            align: 'start'
          }
        },
        {
          element: '#sidebar-faculty',
          popover: {
            title: 'Faculty',
            description: 'Manage and view information about your faculty members.',
            side: 'right',
            align: 'start'
          }
        },
        {
          element: '#sidebar-rooms',
          popover: {
            title: 'Rooms',
            description: 'View and manage available rooms and their schedules.',
            side: 'right',
            align: 'start'
          }
        },
        {
          element: '#sidebar-profile',
          popover: {
            title: 'Your Profile',
            description: 'Manage your personal settings and account preferences.',
            side: 'bottom',
            align: 'end'
          }
        }
      ].filter(step => document.querySelector(step.element as string)),
      onDestroyed: () => {
        localStorage.setItem('wicars_tour_done', 'true')
      }
    })

    driverObj.drive()
  }, [])
}
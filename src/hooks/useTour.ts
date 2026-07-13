import { useEffect } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export function useTour() {
  useEffect(() => {
    // Unique key per user to ensure everyone gets the tour once
    const userJson = localStorage.getItem('user') || sessionStorage.getItem('user')
    const user = userJson ? JSON.parse(userJson) : null
    const tourKey = user ? `wicars_tour_done_${user.username}` : 'wicars_tour_done_guest'

    let isComponentMounted = true
    let activeDriver: any = null

    const startTour = () => {
      // Filter steps to ensure elements are present in the DOM
      const steps = [
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
          element: '#sidebar-users',
          popover: {
            title: 'Users',
            description: 'Manage and view information about system users.',
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
      ].filter(step => document.querySelector(step.element as string))

      // If no target elements are found, do not run the tour yet
      if (steps.length === 0) return

      const driverObj = driver({
        showProgress: true,
        steps: steps as any,
        onDestroyed: () => {
          // Only mark the tour as seen if the destruction is user-initiated (not unmounting)
          if (isComponentMounted) {
            localStorage.setItem(tourKey, 'true')
          }
        }
      })

      driverObj.drive()
      activeDriver = driverObj
    }

    const init = () => {
      const hasSeen = localStorage.getItem(tourKey)
      if (!hasSeen && isComponentMounted) {
        startTour()
      }
    }

    // Run tour logic on frame buffer to make sure DOM is painted
    const rafId = requestAnimationFrame(() => {
      init()
    })

    const handleRestart = () => {
      localStorage.removeItem(tourKey)
      if (activeDriver) {
        activeDriver.destroy()
      }
      startTour()
    }

    window.addEventListener('restart-tour', handleRestart)

    return () => {
      isComponentMounted = false
      cancelAnimationFrame(rafId)
      if (activeDriver) {
        activeDriver.destroy()
      }
      window.removeEventListener('restart-tour', handleRestart)
    }
  }, [])
}
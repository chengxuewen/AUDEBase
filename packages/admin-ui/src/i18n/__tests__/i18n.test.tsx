import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider, i18n } from '../index.js'
import { useTranslation } from 'react-i18next'

function TestComponent(): ReactNode {
  const { t } = useTranslation('client')
  return <div>{t('login.title')}</div>
}

describe('I18nProvider', () => {
  it('should render children', () => {
    // Arrange
    const childText = 'child-content'

    // Act
    const { getByText } = render(
      <I18nProvider>
        <div>{childText}</div>
      </I18nProvider>,
    )

    // Assert
    expect(getByText(childText)).toBeTruthy()
  })

  it('should provide t() function that returns zh-CN translations', () => {
    // Arrange
    // Act
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    )

    // Assert
    expect(screen.getByText('登录')).toBeTruthy()
  })

  it('should use zh-CN as default language', () => {
    // Arrange
    // Act
    // Assert
    expect(i18n.language).toBe('zh-CN')
  })

  it('should use client as default namespace', () => {
    // Arrange
    // Act
    // Assert
    expect(i18n.options.defaultNS).toBe('client')
  })
})

# Clean Code in .NET: Writing Maintainable and Scalable Software
Writing clean code is essential for building maintainable, scalable, and efficient software solutions. 
In .NET development, following clean code principles helps improve code readability, reduces technical debt, and better collaboration among developers. 
This article explores key clean code principles and provides practical examples in .NET, referencing best practices from the [Clean Code .NET repository](https://github.com/thangchung/clean-code-dotnet).

## Core Principles of Clean Code
### Meaningful Naming
Good naming conventions improve code readability and maintainability.

❌ Bad Example:
```csharp
var d = DateTime.Now;
var p = new Person();
```

✅ Good Example:
```csharp
var currentDate = DateTime.Now;
var customer = new Person();
```

### Single Responsibility Principle (SRP)
A class should have only one reason to change.

❌ Bad Example:
```csharp
public class ReportService
{
    public void GenerateReport()
    {
        Console.WriteLine("Generating report...");
    }
    
    public void SaveReportToDatabase()
    {
        Console.WriteLine("Saving report...");
    }
}
```

✅ Good Example:
```csharp
public class ReportGenerator
{
    public string Generate()
    {
        return "Report generated.";
    }
}

public class ReportRepository
{
    public void Save(string report)
    {
        Console.WriteLine($"Saving report: {report}");
    }
}

// Example Usage
var generator = new ReportGenerator();
var repository = new ReportRepository();
var report = generator.Generate();
repository.Save(report);
```

### Avoiding Magic Numbers and Strings
Hardcoded values make code difficult to understand and maintain.

❌ Bad Example:
```csharp
if (status == 1)
{
    Console.WriteLine("Active");
}
```

✅ Good Example:
```csharp
public enum Status
{
    Inactive = 0,
    Active = 1
}

if (status == Status.Active)
{
    Console.WriteLine("Active");
}
```

### DRY (Don’t Repeat Yourself)
Avoid code duplication to enhance maintainability.

❌ Bad Example:
```csharp
public double CalculateTotal(double price, double tax)
{
    return price + (price * 0.2);
}

public double CalculateDiscountedTotal(double price, double tax, double discount)
{
    return (price - discount) + ((price - discount) * 0.2);
}
```

✅ Good Example:
```csharp
public double CalculateTotal(double price, double taxRate, double discount = 0)
{
    double discountedPrice = price - discount;
    return discountedPrice + (discountedPrice * taxRate);
}
```

### Proper Exception Handling
Avoid generic exceptions and provide meaningful error messages.

❌ Bad Example:
```csharp
try
{
    var result = 10 / divisor;
}
catch (Exception ex)
{
    Console.WriteLine("Something went wrong.");
}
```

✅ Good Example:
```csharp
if (divisor == 0)
{
    Console.WriteLine("Cannot divide by zero.");
}
else
{
    try
    {
        var result = 10 / divisor;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"An error occurred: {ex.Message}");
    }
}
```

## Conclusion
Applying clean code concepts to.NET improves the quality of the software, makes the codebase easier to comprehend and manage, and enables teamwork. 
Adhering to best practices such as significant names, the Single Responsibility Principle, and exception handling improves the readability, maintainability, and performance of code.

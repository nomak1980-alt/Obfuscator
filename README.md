# 🔒 C# & MS SQL Code Obfuscator

Eine einfache Web-Anwendung zur Verschleierung von C# und MS SQL Code für die sichere Weitergabe an KI-Modelle.

## 🎯 Zweck

Dieser Obfuscator hilft dabei, vertrauliche Bezeichner im Code zu verschleiern, bevor du ihn an KI-Modelle wie ChatGPT, Claude, etc. weitergibst. Nach Erhalt der KI-Antwort kannst du den Code wieder zurückverwandeln.

## 🚀 Funktionen

### **Code-Analyse**
- Automatische Erkennung von Klassen, Methoden, Variablen, Parametern
- Unterstützung für C# und MS SQL Syntax
- Intelligente Filterung von reservierten Wörtern

### **Custom Text Ersetzung**
- Benutzerdefinierte Texte werden zuerst ersetzt
- Unterstützt verschiedene Schreibweisen (customer, Customer, CUSTOMER)
- Namen mit Custom-Texten werden bei der normalen Verschleierung ignoriert

### **Verschleierung**
- Eindeutige Platzhalter für jeden Namen
- Erhaltung der Code-Struktur und Syntax
- Kopierbare Ergebnisse für KI-Eingabe

### **Rückverwandlung**
- Exakte Wiederherstellung des Original-Codes
- Berücksichtigung der ursprünglichen Groß-/Kleinschreibung
- Einfache 1:1 Mapping-Rückverwandlung

## 🌐 Nutzung

### **HTML-Version**
Öffne einfach die `obfuscator.html` Datei in einem modernen Webbrowser:

```bash
# Doppelklick auf die Datei oder:
start obfuscator.html
```

### **Workflow**
1. **Code-Typ wählen** - C# oder MS SQL
2. **Code einfügen** - Dein Original-Code
3. **Analysieren** - Automatische Erkennung aller Namen
4. **Custom Texts eingeben** - z.B. "customer", "repository"
5. **Namen auswählen** - Wähle welche Namen verschleiert werden sollen
6. **Verschleiern** - Generiere verschleierten Code
7. **Kopieren** - Kopiere den Code für die KI
8. **KI-Antwort einfügen** - Füge die KI-Antwort zurück
9. **Zurückverwandeln** - Stelle den Original-Code wieder her

## 📝 Beispiel

### **Original Code:**
```csharp
public class CustomerManager
{
    private readonly IRepository<Customer> customerRepository;
    
    public Customer GetCustomerById(int customerId)
    {
        var customer = customerRepository.GetById(customerId);
        logger.LogInformation($"Found {activeCustomers.Count()} active customers");
        return customer;
    }
}
```

### **Nach Custom-Text-Ersetzung ("customer"):**
```csharp
public class CustomerManager
{
    private readonly IRepository<TEXT1> customerRepository;
    
    public TEXT1 GetCustomerById(int customerId)
    {
        var TEXT1 = customerRepository.GetById(customerId);
        logger.LogInformation($"Found {activeCustomers.Count()} active TEXT1s");
        return TEXT1;
    }
}
```

### **Nach vollständiger Verschleierung:**
```csharp
public class VAR1
{
    private readonly IRepository<TEXT1> customerRepository;
    
    public TEXT1 VAR2(int VAR3)
    {
        var TEXT1 = customerRepository.GetById(VAR3);
        logger.LogInformation($"Found {VAR4.Count()} active TEXT1s");
        return TEXT1;
    }
}
```

## 🔧 Technische Details

### **Custom-Text-Algorithmus**
1. **Schritt 1:** Custom Texte werden durch Platzhalter ersetzt
   - `customer` → `TEXT1`
   - `Customer` → `TEXT2`
   - `CUSTOMER` → `TEXT3`

2. **Schritt 2:** Code-Analyse ignoriert Namen mit Platzhaltern
   - `customerRepository` wird nicht verschleiert (enthält `customer`)

3. **Schritt 3:** Restliche Namen werden normal verschleiert

### **Rückverwandlungs-Algorithmus**
- Direkte 1:1 Ersetzung von Platzhaltern zu Original-Texten
- Berücksichtigung der ursprünglichen Groß-/Kleinschreibung
- Keine komplizierten Regex-Muster erforderlich

## 🎨 Features

- **🔍 Intelligente Code-Analyse** - Automatische Erkennung aller Code-Elemente
- **📝 Custom Text Support** - Benutzerdefinierte Ersetzungen mit Priorität
- **🔄 Bidirektionale Umwandlung** - Verschleiern und Rückverwandeln
- **📋 Einfache Kopierfunktion** - One-Click Kopieren für KI-Eingaben
- **🎯 Präzise Ersetzungen** - Nur ganze Wörter, keine Teil-Strings
- **💾 Keine Server erforderlich** - Läuft vollständig im Browser

## 🌟 Vorteile

- **Sicherheit** - Vertrauliche Bezeichner werden geschützt
- **Einfachheit** - Keine Installation erforderlich
- **Kompatibilität** - Funktioniert mit allen KI-Modellen
- **Effizienz** - Schnelle Verarbeitung direkt im Browser
- **Genauigkeit** - Exakte Rückverwandlung ohne Informationsverlust

## 📂 Projektstruktur

```
Obfuscator/
├── obfuscator.html          # Hauptanwendung (HTML + JavaScript + CSS)
├── README.md               # Dokumentation
└── .vscode/               # VS Code Konfiguration
    ├── settings.json
    └── tasks.json
```

## 🔮 Zukünftige Erweiterungen

- [ ] Unterstützung für weitere Programmiersprachen
- [ ] Batch-Verarbeitung für mehrere Dateien
- [ ] Import/Export von Mapping-Konfigurationen
- [ ] Dark Mode UI
- [ ] Erweiterte Analytik-Statistiken

## 🤝 Beitrag

Fehlermeldungen und Verbesserungsvorschläge sind willkommen!

---

**Hinweis:** Diese Anwendung ist ausschließlich für die Verschleierung von Code gedacht, bevor er an externe KI-Dienste weitergegeben wird. Sie ersetzt nicht professionelle Sicherheitsmaßnahmen.

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.comments import Comment


# Transcribed from the user-supplied All Panna Record chart.
groups = {
    1: ['137', '128', '146', '236', '245', '290', '380', '470', '489', '560', '678', '579', '119', '155', '227', '335', '344', '399', '588', '669', '777', '100'],
    2: ['129', '138', '147', '156', '237', '246', '345', '390', '480', '570', '589', '679', '110', '228', '255', '336', '499', '660', '688', '778', '200', '444'],
    3: ['120', '139', '148', '157', '238', '247', '256', '346', '490', '580', '670', '689', '166', '229', '337', '355', '445', '599', '779', '788', '300', '111'],
    4: ['130', '149', '158', '167', '239', '248', '257', '347', '356', '590', '680', '789', '112', '220', '266', '338', '446', '455', '699', '770', '400', '888'],
    5: ['140', '159', '168', '230', '249', '258', '267', '348', '357', '456', '690', '780', '113', '122', '177', '339', '366', '447', '799', '889', '500', '555'],
    6: ['123', '150', '169', '178', '240', '259', '268', '349', '358', '367', '457', '790', '114', '277', '330', '448', '466', '556', '880', '899', '600', '222'],
    7: ['124', '160', '179', '250', '269', '278', '340', '359', '368', '458', '467', '890', '115', '133', '188', '223', '377', '449', '557', '566', '700', '999'],
    8: ['125', '134', '170', '189', '260', '279', '350', '369', '378', '459', '468', '567', '116', '224', '233', '288', '440', '477', '558', '990', '800', '666'],
    9: ['126', '135', '180', '234', '270', '289', '360', '379', '450', '469', '478', '568', '117', '144', '199', '225', '388', '559', '577', '667', '900', '333'],
    0: ['127', '136', '145', '190', '235', '280', '370', '389', '460', '479', '569', '578', '118', '226', '244', '299', '334', '488', '668', '677', '000', '550'],
}

wb = Workbook()
ws = wb.active
ws.title = 'Panna List'

navy = '13265B'
red = 'D90404'
gold = 'FFD54A'
white = 'FFFFFF'
thin_gray = Side(style='thin', color='D9E1F2')
border = Border(left=thin_gray, right=thin_gray, top=thin_gray, bottom=thin_gray)

ws.merge_cells('A1:D1')
ws['A1'] = 'ALL PANNA RECORD — 220 PANNA LIST'
ws['A1'].font = Font(name='Arial', size=16, bold=True, color=white)
ws['A1'].fill = PatternFill('solid', fgColor=navy)
ws['A1'].alignment = Alignment(horizontal='center')

headers = ['Final Ank', 'Panna', 'Type', 'Source Order']
for col, value in enumerate(headers, 1):
    c = ws.cell(3, col, value)
    c.font = Font(name='Arial', bold=True, color=white)
    c.fill = PatternFill('solid', fgColor=red)
    c.alignment = Alignment(horizontal='center')

row = 4
for final_ank in list(range(1, 10)) + [0]:
    for order, panna in enumerate(groups[final_ank], 1):
        digits = list(panna)
        panna_type = 'Triple' if len(set(digits)) == 1 else ('Double' if len(set(digits)) == 2 else 'Single')
        ws.cell(row, 1, final_ank)
        p = ws.cell(row, 2, panna)
        p.number_format = '@'
        ws.cell(row, 3, panna_type)
        ws.cell(row, 4, order)
        for col in range(1, 5):
            cell = ws.cell(row, col)
            cell.font = Font(name='Arial', size=10)
            cell.alignment = Alignment(horizontal='center')
            cell.border = border
        row += 1

table = Table(displayName='AllPannaList', ref=f'A3:D{row - 1}')
table.tableStyleInfo = TableStyleInfo(name='TableStyleMedium2', showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=False)
ws.add_table(table)
ws.freeze_panes = 'A4'
ws.auto_filter.ref = f'A3:D{row - 1}'
for column, width in {'A': 13, 'B': 13, 'C': 14, 'D': 15}.items():
    ws.column_dimensions[column].width = width

grouped = wb.create_sheet('Grouped View')
grouped.merge_cells('A1:F1')
grouped['A1'] = 'PANNA GROUPED BY FINAL ANK'
grouped['A1'].font = Font(name='Arial', size=16, bold=True, color=white)
grouped['A1'].fill = PatternFill('solid', fgColor=navy)
grouped['A1'].alignment = Alignment(horizontal='center')

start_row = 3
for final_ank in list(range(1, 10)) + [0]:
    grouped.merge_cells(start_row=start_row, start_column=1, end_row=start_row, end_column=6)
    title = grouped.cell(start_row, 1, f'Final Ank {final_ank}')
    title.font = Font(name='Arial', size=12, bold=True, color=white)
    title.fill = PatternFill('solid', fgColor=red if final_ank in (1, 2, 4, 5, 8) else navy)
    title.alignment = Alignment(horizontal='center')
    for index, panna in enumerate(groups[final_ank]):
        r = start_row + 1 + index // 6
        c = 1 + index % 6
        cell = grouped.cell(r, c, panna)
        cell.number_format = '@'
        cell.font = Font(name='Arial', size=11, bold=True)
        cell.alignment = Alignment(horizontal='center')
        cell.border = border
    start_row += 6

for c in 'ABCDEF':
    grouped.column_dimensions[c].width = 14
grouped.freeze_panes = 'A3'

info = wb.create_sheet('Notes')
info.merge_cells('A1:B1')
info['A1'] = 'Workbook Notes'
info['A1'].font = Font(name='Arial', size=16, bold=True, color=white)
info['A1'].fill = PatternFill('solid', fgColor=navy)
info['A1'].alignment = Alignment(horizontal='center')
notes = [
    ('Contents', '220 Panna values from the supplied All Panna Record image.'),
    ('Organisation', 'Panna List is filterable; Grouped View mirrors the digit-wise chart.'),
    ('Leading zero', '000 is stored as text so its leading zeroes remain visible.'),
    ('Source', 'User-supplied image: All Panna Record Chart.'),
]
for r, (label, text) in enumerate(notes, 3):
    info.cell(r, 1, label)
    info.cell(r, 2, text)
    info.cell(r, 1).font = Font(name='Arial', bold=True)
    info.cell(r, 2).font = Font(name='Arial')
    for c in range(1, 3):
        info.cell(r, c).alignment = Alignment(vertical='top', wrap_text=True)
        info.cell(r, c).border = border
info['B6'].comment = Comment('The values in this workbook were transcribed from the image supplied by the user.', 'Codex')
info.column_dimensions['A'].width = 18
info.column_dimensions['B'].width = 80

for sheet in wb.worksheets:
    sheet.sheet_view.showGridLines = False

wb.save('All_Panna_Record.xlsx')
